// 主机存活监控：对台账内每台资产做 TCP 端口探测（有端口时）或 ICMP ping（无端口时），
// 定时刷新 status / healthScore / reachable / latencyMs / lastCheckAt，驱动资产页「在线/离线」与延迟展示。
import net from 'node:net'
import { exec } from 'node:child_process'
import { memoryStore } from '../store/memoryStore'
import type { Asset, Status } from '@shared/types'

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

/** ICMP ping 兜底：无端口时按主机名/IP 探测，跨平台解析 TTL/丢包与往返延迟 */
function pingProbe(host: string, timeoutMs = 2000): Promise<{ reachable: boolean; latencyMs?: number }> {
  return new Promise((resolve) => {
    if (!host) return resolve({ reachable: false })
    const isWin = process.platform === 'win32'
    const cmd = isWin
      ? `ping -n 1 -w ${timeoutMs} ${host}`
      : `ping -c 1 -W 2 ${host}`
    let settled = false
    const proc = exec(cmd, { timeout: timeoutMs + 1500 }, (err, stdout) => {
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

/** 单台探测：有端口优先 TCP，否则 ping */
export async function probeAsset(asset: Asset): Promise<{ reachable: boolean; latencyMs?: number }> {
  const target = asset.host || asset.ip || ''
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
