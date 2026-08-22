import net from 'node:net'
import type { Asset, ServiceCheck, ServiceCheckResult } from '@shared/types'
import { memoryStore } from '../store/memoryStore'
import { credentialService } from './credentialService'
import { connectSsh, runCommand } from './sshService'
import { alertService } from './alertService'
import { logger } from '../utils/logger'

/** TCP 端口连通检测（3s 超时），返回 null=可连通，否则为失败原因 */
export function tcpCheck(host: string, port: number, timeoutMs = 3000): Promise<string | null> {
  return new Promise((resolve) => {
    const s = net.connect({ host, port })
    const done = (err: string | null) => { s.destroy(); resolve(err) }
    s.setTimeout(timeoutMs, () => done('连接超时'))
    s.on('connect', () => done(null))
    s.on('error', (e) => done(e.message))
  })
}

/** 解析 systemd 服务状态输出中的 active 状态行（纯函数，便于单测） */
export function parseSystemdActive(out: string): { active: boolean; sub?: string } {
  // systemctl is-active 输出 active / inactive / failed / activating 等
  const state = out.trim().split('\n')[0]?.trim().toLowerCase() || ''
  if (state === 'active') {
    // is-enabled 或 show 输出中可能带 SubState，这里仅从 is-active 结果判定
    return { active: true }
  }
  return { active: false, sub: state || undefined }
}

function assetSshParams(asset: Asset) {
  if (!asset.credentialId) throw new Error(`资产 ${asset.name} 未关联 SSH 凭据`)
  const secret = credentialService.decrypt(asset.credentialId)
  if (!secret?.username) throw new Error(`资产 ${asset.name} 的 SSH 凭据不存在或已失效`)
  return {
    host: asset.ip || asset.host,
    port: 22,
    username: secret.username,
    password: secret.password,
    privateKey: secret.privateKey,
  }
}

/** 执行单个服务检查（进程/端口/systemd），失败且 autoHeal 时经 SSH 自愈重启。永不抛错，结果落在 lastResult。 */
export async function runCheck(check: ServiceCheck): Promise<ServiceCheck> {
  const asset = memoryStore.getAssets().find((a) => a.id === check.assetId)
  const now = new Date().toISOString()
  let result: ServiceCheckResult

  try {
    if (!asset) throw new Error('关联资产不存在或已被删除')

    if (check.checkType === 'port') {
      if (!check.port) throw new Error('端口检查缺少端口号')
      const err = await tcpCheck(asset.ip || asset.host, check.port)
      result = {
        alive: err === null,
        detail: err === null ? `${asset.ip || asset.host}:${check.port} 连通` : `端口不通（${err}）`,
        checkedAt: now,
      }
    } else {
      // process / systemd 均需 SSH
      const params = assetSshParams(asset)
      const client = await connectSsh(params)
      try {
        if (check.checkType === 'systemd') {
          const out = await runCommand(client, `systemctl is-active ${JSON.stringify(check.serviceName).replace(/"/g, '')} 2>&1 || true`)
          const { active } = parseSystemdActive(out)
          result = {
            alive: active,
            detail: active ? `systemd 服务 ${check.serviceName} 运行中` : `systemd 服务 ${check.serviceName} 未运行（${out.trim() || '未知'}）`,
            checkedAt: now,
          }
        } else {
          // 进程存活：pgrep 精确匹配进程名
          const out = await runCommand(client, `pgrep -x ${JSON.stringify(check.serviceName).replace(/"/g, '')} 2>&1 || true`)
          const pids = out.trim().split('\n').filter((l) => /^\d+$/.test(l.trim()))
          result = {
            alive: pids.length > 0,
            detail: pids.length > 0 ? `进程 ${check.serviceName} 存在（PID ${pids.slice(0, 3).join(', ')}）` : `未找到进程 ${check.serviceName}`,
            checkedAt: now,
          }
        }
      } finally {
        client.end()
      }
    }
  } catch (e) {
    result = {
      alive: false,
      detail: `检查执行失败：${e instanceof Error ? e.message : String(e)}`,
      checkedAt: now,
    }
  }

  // 自愈：期望存活但检测失败时，尝试 systemctl restart
  if (check.autoHeal && check.expectAlive && !result.alive && asset && check.checkType !== 'port') {
    try {
      const client = await connectSsh(assetSshParams(asset))
      try {
        await runCommand(client, `sudo systemctl restart ${JSON.stringify(check.serviceName).replace(/"/g, '')} 2>&1 || systemctl restart ${JSON.stringify(check.serviceName).replace(/"/g, '')} 2>&1 || true`)
        // 重启后复查一次
        const out = await runCommand(client, `systemctl is-active ${JSON.stringify(check.serviceName).replace(/"/g, '')} 2>&1 || true`)
        const { active } = parseSystemdActive(out)
        result = {
          ...result,
          healed: true,
          healDetail: active ? '已自动重启并恢复运行' : `已执行自动重启（当前状态 ${out.trim()}），请关注`,
        }
      } finally {
        client.end()
      }
    } catch (e) {
      result = { ...result, healed: false, healDetail: `自愈失败：${e instanceof Error ? e.message : String(e)}` }
    }
  }

  // 与期望不符 → 生成告警（带静默去重语义的 level 按检查类型给 一般）
  const abnormal = check.expectAlive ? !result.alive : result.alive
  if (abnormal) {
    try {
      alertService.create({
        title: `服务巡检异常：${check.name}`,
        message: `${asset?.name || check.assetId} · ${result.detail}${result.healed ? `（${result.healDetail}）` : ''}`,
        level: 'P2',
        state: 'active',
        assetId: check.assetId,
      })
    } catch (e) {
      logger.warn(`[serviceCheck] 告警生成失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return memoryStore.updateServiceCheck(check.id, { lastResult: result }) || { ...check, lastResult: result }
}

/** 批量执行所有启用的检查 */
export async function runAllChecks(): Promise<ServiceCheck[]> {
  const enabled = memoryStore.getServiceChecks().filter((c) => c.enabled)
  const out: ServiceCheck[] = []
  for (const c of enabled) {
    out.push(await runCheck(c))
  }
  return out
}
