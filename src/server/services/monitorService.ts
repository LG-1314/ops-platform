// 主机存活监控：对台账内每台资产做 TCP 端口探测（有端口时）或 ICMP ping（无端口时），
// 定时刷新 status / healthScore / reachable / latencyMs / lastCheckAt，驱动资产页「在线/离线」与延迟展示。
import net from 'node:net'
import { execFile } from 'node:child_process'
import { memoryStore } from '../store/memoryStore'
import type { Asset, Status } from '@shared/types'

/**
 * host 合法性校验：仅允许 IPv4 / IPv6 / 域名 / localhost。
 * 防御纵深——即便校验遗漏，pingProbe 也用 execFile 数组参数（无 shell），
 * 参数恒为独立 argv，无法拼出第二条命令，从根本上杜绝命令注入（原 exec 拼接可被 `1.2.3.4; calc` 注入）。
 */
function isValidHost(h: string): boolean {
  if (!h || h.length === 0 || h.length > 253) return false
  // IPv4
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(h)) {
    return h.split('.').every((n) => {
      const v = Number(n)
      return Number.isInteger(v) && v >= 0 && v <= 255
    })
  }
  // IPv6（含冒号且为十六进制/冒号组合）
  if (h.includes(':') && /^[:0-9a-fA-F]+$/.test(h)) return true
  // 域名 / localhost（标签式）
  if (/^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*$/.test(h)) return true
  return false
}

/** TCP 端口探测：最可靠、无需特殊权限；超时即判不可达 */
function tcpProbe(host: string, port: number, timeoutMs = 2000): Promise<{ reachable: boolean; latencyMs?: number }> {
  return new Promise((resolve) => {
    if (!host || !port) return resolve({ reachable: false })
    const start = Date.now()
    let done = false
    const sock = net.connect(port, host)
    const finish = (reachable: boolean) => {
      if (done) return
      done = true
      try { sock.destroy() } catch { /* ignore */ }
      resolve(reachable ? { reachable, latencyMs: Date.now() - start } : { reachable: false })
    }
    sock.setTimeout(timeoutMs)
    sock.once('connect', () => finish(true))
    sock.once('timeout', () => finish(false))
    sock.once('error', () => finish(false))
  })
}

/** ICMP ping 兜底：无端口时按主机名/IP 探测，跨平台解析 TTL/丢包与往返延迟。
 *  使用 execFile + 数组参数（无 shell），host 经 isValidHost 校验，杜绝命令注入。 */
function pingProbe(host: string, timeoutMs = 2000): Promise<{ reachable: boolean; latencyMs?: number }> {
  return new Promise((resolve) => {
    if (!isValidHost(host)) return resolve({ reachable: false })
    const isWin = process.platform === 'win32'
    const args = isWin
      ? ['-n', '1', '-w', String(timeoutMs), host]
      : ['-c', '1', '-W', '2', host]
    let settled = false
    const proc = execFile('ping', args, { timeout: timeoutMs + 1500 }, (err, stdout) => {
      if (settled) return
      settled = true
      const out = String(stdout || '')
      const reachable = !err && /TTL=|ttl=|0% packet loss|0% 丢包|0% パケット/.test(out)
      let latencyMs: number | undefined
      const m = out.match(/time[<=]?[\s]*(\d+(?:\.\d+)?)\s*ms/i)
      if (m) latencyMs = Math.round(parseFloat(m[1]))
      resolve({ reachable, latencyMs })
    })
    proc.on('error', () => {
      if (settled) return
      settled = true
      resolve({ reachable: false })
    })
  })
}

/** 单台探测：有端口优先 TCP，否则 ping；IP 为回环地址时优先用 IP 避免主机名解析失败。 */
export async function probeAsset(asset: Asset): Promise<{ reachable: boolean; latencyMs?: number }> {
  const isLoopback = asset.ip === '127.0.0.1' || asset.ip === '::1'
  const target = isLoopback && asset.ip ? asset.ip : asset.host || asset.ip || ''
  if (asset.port && asset.port > 0) return tcpProbe(target, asset.port)
  return pingProbe(target)
}

/** 由探测结果推导状态与健康分：不可达→error/0；延迟越高→warn 扣分 */
function scoreFromResult(reachable: boolean, latencyMs?: number): { status: Status; healthScore: number } {
  if (!reachable) return { status: 'error', healthScore: 0 }
  const lat = latencyMs ?? 0
  if (lat > 500) return { status: 'warn', healthScore: 55 }
  if (lat > 200) return { status: 'warn', healthScore: 75 }
  if (lat > 80) return { status: 'ok', healthScore: 90 }
  return { status: 'ok', healthScore: 100 }
}

let monitorInterval: ReturnType<typeof setInterval> | null = null

export const monitorService = {
  /** 立即扫描全部资产一次 */
  async scanOnce(): Promise<void> {
    const assets = memoryStore.getAssets()
    for (const a of assets) {
      const { reachable, latencyMs } = await probeAsset(a)
      const { status, healthScore } = scoreFromResult(reachable, latencyMs)
      const now = new Date().toISOString()
      memoryStore.updateAsset(a.id, {
        reachable,
        latencyMs,
        lastCheckAt: now,
        status,
        healthScore,
        lastScanAt: now,
      })
    }
  },

  /** 扫描单台资产 */
  async scanOne(id: string): Promise<boolean> {
    const a = memoryStore.getAssets().find((x) => x.id === id)
    if (!a) return false
    const { reachable, latencyMs } = await probeAsset(a)
    const { status, healthScore } = scoreFromResult(reachable, latencyMs)
    const now = new Date().toISOString()
    memoryStore.updateAsset(id, {
      reachable,
      latencyMs,
      lastCheckAt: now,
      status,
      healthScore,
      lastScanAt: now,
    })
    return true
  },

  /** 启动定时监控：先立即扫一次，再每 intervalMs 扫描 */
  start(intervalMs = 30000): ReturnType<typeof setInterval> {
    this.stop()
    void this.scanOnce().catch(() => {})
    monitorInterval = setInterval(() => {
      void this.scanOnce().catch(() => {})
    }, intervalMs)
    return monitorInterval
  },

  /** 停止定时监控 */
  stop(): void {
    if (monitorInterval) {
      clearInterval(monitorInterval)
      monitorInterval = null
    }
  },
}
