import { Client, type ClientChannel } from 'ssh2'
import type { HostMetricSample, DiskUsage, NetSample } from '@shared/types'
import { setLatest } from './hostMetricsCache'
import { metricSeriesStore } from '../store/metricSeriesStore'
import { verifyHostKey } from './sshHostKeys'

export interface SshConnectParams {
  host: string
  port?: number
  username?: string
  password?: string
  privateKey?: string
}

/** 远端 shell 参数安全转义；用于需要拼接到单条 SSH 命令的用户输入。 */
export function shellQuoteArg(value: string): string {
  return `'${String(value).replace(/'/g, "'\\''")}'`
}

/** 建立 SSH 连接（密码或私钥），超时自动销毁，绝不挂起。
 *  主机密钥校验（TOFU）：首次连接记录指纹，之后不匹配即拒绝（防中间人）。 */
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
      hostVerifier: (hostname: string, key: Buffer, cb: (err?: Error) => void) => {
        const problem = verifyHostKey(params.host || hostname, params.port, params.username, key)
        // 指纹不匹配必须 reject：连接终止并给出可读的中间人告警
        cb(problem ? new Error(problem) : undefined)
      },
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

function parseNet(netOut: string): NetSample | undefined {
  // /proc/net/dev：聚合所有非 lo 接口的累计收发字节（列 2 = rx，列 9 = tx）
  // 多接口聚合：服务器常有多网卡（eth0/eth1/br0），取总和更能反映整机吞吐。
  let rx = 0
  let tx = 0
  let found = false
  for (const line of netOut.split('\n')) {
    const m = line.trim().match(/^([a-zA-Z0-9._-]+):\s+(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/)
    if (m && m[1] !== 'lo') {
      rx += Number(m[2])
      tx += Number(m[3])
      found = true
    }
  }
  return found ? { rxBytes: rx, txBytes: tx } : undefined
}

function parseMetrics(host: string, uptimeOut: string, freeOut: string, dfOut: string, cpuOut: string, netOut: string): HostMetricSample {
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
  // Swap 行（可选）
  const swapLine = freeOut.split('\n').find((l) => l.startsWith('Swap:'))
  if (swapLine) {
    const snums = swapLine.replace(/Swap:/, '').trim().split(/\s+/).map(Number)
    if (snums.length >= 2) sample.swapUsedMb = snums[1]
  }

  // top -bn1 取平均 CPU 行：%Cpu(s):  us, sy, ni, id, wa, hi, si, st
  const cpu = cpuOut.match(/%Cpu\(s\):\s*([\d.]+)\s*us,\s*([\d.]+)\s*sy,[\s\S]*?([\d.]+)\s*id/)
  if (cpu) {
    sample.cpuUser = parseFloat(cpu[1])
    sample.cpuSystem = parseFloat(cpu[2])
    sample.cpuIdle = parseFloat(cpu[3])
  }

  const net = parseNet(netOut)
  if (net) sample.network = net

  // df -P -B1（字节）：Filesystem 1024-blocks Used Available Capacity Mounted
  // 伪文件系统（tmpfs/overlay 等）计入会拉高"最大磁盘占用"造成误告警，在解析层过滤
  const PSEUDO_FS = /^(tmpfs|devtmpfs|udev|overlay|squashfs|shm|none|cgroup|cgmfs|efivarfs|iso9660|ramfs)/
  const PSEUDO_MOUNT = /^(\/dev|\/sys|\/proc|\/run|\/snap|\/boot\/efi)($|\/)/
  const lines = dfOut.split('\n').filter((l) => l.trim().length > 0)
  for (const line of lines) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 6) continue
    if (PSEUDO_FS.test(parts[0]) || PSEUDO_MOUNT.test(parts[5])) continue
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

  if (!load && !memLine && !cpu && sample.disk.length === 0) sample.status = 'unknown'
  return sample
}

/** 采集目标主机运行中的 systemd 服务列表（含状态）。可选指定服务名或返回全部非系统服务。 */
export async function collectServices(
  params: SshConnectParams,
  filter?: string
): Promise<{ name: string; status: string; description: string; active: boolean }[]> {
  const client = await connectSsh(params)
  try {
    const cmd = filter
      ? `systemctl show -p Names,ActiveState,Description --value ${shellQuoteArg(filter)} 2>/dev/null`
      : `systemctl list-units --type=service --all --no-pager --no-legend 2>/dev/null | head -100`
    const out = await runCommand(client, cmd, 10000).catch(() => '')
    const services: { name: string; status: string; description: string; active: boolean }[] = []
    if (filter) {
      const lines = out.trim().split('\n')
      if (lines.length >= 3) {
        services.push({ name: lines[0] || filter, status: lines[1] || 'unknown', description: lines[2] || '', active: lines[1] === 'active' })
      }
    } else {
      for (const line of out.split('\n')) {
        const m = line.trim().match(/^(\S+)\s+(\S+)\s+(\S+)\s+(.+)/)
        if (m) {
          services.push({ name: m[1], status: `${m[2]}/${m[3]}`, description: m[4].trim(), active: m[2] === 'running' })
        }
      }
    }
    return services
  } finally {
    client.end()
  }
}

/** 一次性采集主机指标（CPU/内存/磁盘/负载），结果写入缓存并返回。 */
export async function collectMetrics(params: SshConnectParams, assetId?: string): Promise<HostMetricSample> {
  const client = await connectSsh(params)
  try {
    const [uptimeOut, freeOut, dfOut, cpuOut, netOut] = await Promise.all([
      runCommand(client, 'uptime 2>/dev/null', 6000).catch(() => ''),
      // 只用 free -m：此前回退 free -b 但解析仍按 MB 算（BusyBox 下内存数据放大 1024 倍）
      runCommand(client, 'free -m 2>/dev/null', 6000).catch(() => ''),
      // 保留基础 -P 输出（-x 排除参数在 BusyBox 上不可用），伪文件系统在解析层过滤
      runCommand(client, "df -P -B1 2>/dev/null | grep -v Filesystem", 6000).catch(() => ''),
      // 平均 CPU 行；top 缺失时捕获空串，cpuIdle 保持 undefined，告警规则自动跳过（不报错）
      runCommand(client, "top -bn1 2>/dev/null | grep -i 'Cpu(s)' | head -1", 6000).catch(() => ''),
      // 网络累计字节（Linux 专属）；缺失/非 Linux 静默跳过
      runCommand(client, 'cat /proc/net/dev 2>/dev/null', 6000).catch(() => ''),
    ])
    const sample = parseMetrics(assetId || params.host, uptimeOut, freeOut, dfOut, cpuOut, netOut)
    // 网络速率：与上一次采样差分（KB/s），需同资产累计字节才有意义
    if (sample.network?.rxBytes != null && sample.network?.txBytes != null) {
      const prev = metricSeriesStore.getLatest(assetId || params.host)
      if (prev?.network?.rxBytes != null && prev.network.txBytes != null) {
        const dtMs = Date.parse(sample.collectedAt) - Date.parse(prev.collectedAt)
        if (dtMs > 0) {
          // 网卡计数器重置或溢出时差值可能为负，按 0 处理，避免产生错误的负速率。
          sample.network.rxRateKbps = Math.max(
            0,
            Math.round(((sample.network.rxBytes - prev.network.rxBytes) / dtMs) * 1000) / 1024
          )
          sample.network.txRateKbps = Math.max(
            0,
            Math.round(((sample.network.txBytes - prev.network.txBytes) / dtMs) * 1000) / 1024
          )
        }
      }
    }
    setLatest(sample)
    metricSeriesStore.push(sample)
    return sample
  } finally {
    client.end()
  }
}
