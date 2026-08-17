import { Client, type ClientChannel } from 'ssh2'
import type { HostMetricSample, Status, DiskUsage } from '@shared/types'
import { setLatest } from './hostMetricsCache'

export interface SshConnectParams {
  host: string
  port?: number
  username?: string
  password?: string
  privateKey?: string
}

/** 建立 SSH 连接（密码或私钥），超时自动销毁，绝不挂起。 */
export function connectSsh(params: SshConnectParams, timeoutMs = 10000): Promise<Client> {
  return new Promise((resolve, reject) => {
    const client = new Client()
    const timer = setTimeout(() => {
      client.destroy()
      reject(new Error('SSH 连接超时'))
    }, timeoutMs)
    client.on('ready', () => {
      clearTimeout(timer)
      resolve(client)
    })
    client.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    const cfg: Record<string, unknown> = {
      host: params.host,
      port: params.port || 22,
      username: params.username,
      readyTimeout: timeoutMs,
      keepaliveInterval: 0,
    }
    if (params.privateKey) cfg.privateKey = params.privateKey
    else if (params.password) cfg.password = params.password
    client.connect(cfg as never)
  })
}

/** 在已连接客户端上执行单条命令，返回合并后的 stdout+stderr。 */
export function runCommand(client: Client, cmd: string, timeoutMs = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`命令执行超时: ${cmd}`)), timeoutMs)
    client.exec(cmd, (err: Error | undefined, stream: ClientChannel) => {
      if (err) {
        clearTimeout(timer)
        return reject(err)
      }
      let out = ''
      stream.on('data', (d: Buffer) => {
        out += d.toString('utf8')
      })
      stream.stderr.on('data', (d: Buffer) => {
        out += d.toString('utf8')
      })
      stream.on('close', () => {
        clearTimeout(timer)
        resolve(out)
      })
    })
  })
}

function parseMetrics(host: string, uptimeOut: string, freeOut: string, dfOut: string): HostMetricSample {
  const now = new Date().toISOString()
  const sample: HostMetricSample = {
    assetId: host,
    collectedAt: now,
    disk: [],
    status: 'ok',
  }

  const load = uptimeOut.match(/load average:\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)/)
  if (load) {
    sample.load1 = parseFloat(load[1])
    sample.load5 = parseFloat(load[2])
    sample.load15 = parseFloat(load[3])
  }
  const hostM = uptimeOut.match(/^[\s\S]*?up\s+/)
  if (hostM) sample.hostname = (uptimeOut.split('up')[0] || '').trim() || undefined
  sample.uptime = uptimeOut.match(/up\s+(.+?),\s+\d+\s+user/)?.[1]?.trim()

  // free -m / free -b：取 Mem 行
  const memLine = freeOut.split('\n').find((l) => l.startsWith('Mem:'))
  if (memLine) {
    const nums = memLine.replace(/Mem:/, '').trim().split(/\s+/).map(Number)
    // free -m: total used free shared buff/cache available
    if (nums.length >= 3) {
      sample.memTotalMb = nums[0]
      sample.memUsedMb = nums[1]
      sample.memFreeMb = nums[2]
    }
  }

  // df -P -B1（字节）：Filesystem 1024-blocks Used Available Capacity Mounted
  const lines = dfOut.split('\n').filter((l) => l.trim().length > 0)
  for (const line of lines) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 6) continue
    const capacity = parts[4] // 例如 42%
    const pct = parseInt(capacity, 10)
    const totalBytes = Number(parts[1])
    const usedBytes = Number(parts[2])
    const disk: DiskUsage = {
      mount: parts[5],
      totalGb: Math.round((totalBytes / 1e9) * 10) / 10,
      usedGb: Math.round((usedBytes / 1e9) * 10) / 10,
      usedPct: Number.isFinite(pct) ? pct : 0,
    }
    sample.disk.push(disk)
  }

  if (!load && !memLine && sample.disk.length === 0) sample.status = 'unknown'
  return sample
}

/** 一次性采集主机指标（CPU/内存/磁盘/负载），结果写入缓存并返回。 */
export async function collectMetrics(params: SshConnectParams): Promise<HostMetricSample> {
  const client = await connectSsh(params)
  try {
    const [uptimeOut, freeOut, dfOut] = await Promise.all([
      runCommand(client, 'uptime 2>/dev/null', 6000).catch(() => ''),
      runCommand(client, 'free -m 2>/dev/null || free -b 2>/dev/null', 6000).catch(() => ''),
      runCommand(client, "df -P -B1 2>/dev/null | grep -v Filesystem", 6000).catch(() => ''),
    ])
    const sample = parseMetrics(params.host, uptimeOut, freeOut, dfOut)
    setLatest(sample)
    return sample
  } finally {
    client.end()
  }
}
