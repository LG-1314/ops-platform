import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { platform, hostname } from 'node:os'
import {
  parseWindowsMem,
  parseWindowsCpu,
  parseWindowsDisk,
  parseWindowsBoot,
  parsePosixDf,
  parsePosixFree,
  parsePosixUptime,
  parseMacMem,
  parseMacCpu,
  parseLinuxCpu,
} from './parsers.mjs'

export type Status = 'ok' | 'warn' | 'error' | 'unknown'
export interface Metric {
  name: string
  value: string
  normal: string
  status: Status
  detail?: string
}
export interface DiagnoseResult {
  platform: string
  host: string
  timestamp: string
  metrics: Metric[]
  suggestions: string[]
}

const execAsync = promisify(exec)

// 重要边界：体检对象恒为「运行本 App 的这台本机」（执行本机只读命令）。
// 远程主机指标请走 sshService.collectMetrics（主机页 SSH 采集），二者目标与管线彼此独立。

// 异步执行只读命令：此前用 execSync，巡检触发时会把整个事件循环（HTTP/WS/全部定时器）
// 卡住数秒（Windows 上 4 次 PowerShell 启动尤甚）。exec 带超时强杀，永不挂起。
async function sh(cmd: string, timeout = 20000): Promise<string> {
  try {
    const { stdout } = await execAsync(cmd, {
      encoding: 'utf-8',
      timeout,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    })
    return stdout.trim()
  } catch {
    // 非零退出/超时均视为"探针不可用"，由解析层回退为 unknown
    return ''
  }
}

function pctStatus(pct: number | null, warn = 70, err = 90): Status {
  if (pct == null || isNaN(pct)) return 'unknown'
  if (pct >= err) return 'error'
  if (pct >= warn) return 'warn'
  return 'ok'
}

function gb(bytes: number | null): string {
  if (bytes == null || isNaN(bytes)) return '—'
  return (bytes / 1024 ** 3).toFixed(2) + ' GB'
}

function days(ms: number | null): string {
  if (!ms || isNaN(ms)) return '—'
  return (ms / 86400000).toFixed(2) + ' 天'
}

// 跨平台系统体检：只执行只读命令，解析为结构化指标并给出状态评估。
// 各探针相互独立、并行执行，整体耗时 ≈ 最慢一枚探针。
export async function diagnose(): Promise<DiagnoseResult> {
  const plat = platform()
  const isWin = plat === 'win32'
  const isMac = plat === 'darwin'
  const suggestions: string[] = []

  // ---- 并行采集原始输出 ----
  const cpuOut = isWin
    ? sh(`powershell -NoProfile -Command "(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average"`)
    : isMac
      ? sh(`top -l1 -n0 | grep 'CPU usage'`)
      : sh(`top -bn1 | grep '%Cpu'`)

  const memOut = isWin
    ? sh(`powershell -NoProfile -Command "(Get-CimInstance Win32_OperatingSystem).TotalVisibleMemorySize;(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory"`)
    : isMac
      ? sh(`top -l1 -n0 | grep PhysMem`)
      : sh(`free -m`)

  const diskOut = isWin
    ? sh(`powershell -NoProfile -Command "Get-PSDrive C | Select-Object Used,Free | ConvertTo-Json"`)
    : sh(`df -h /`)

  const upOut = isWin
    ? sh(`powershell -NoProfile -Command "(Get-CimInstance Win32_OperatingSystem).LastBootUpTime"`)
    : sh(`uptime`)

  const [cpuRaw, memRaw, diskRaw, upRaw] = await Promise.all([cpuOut, memOut, diskOut, upOut])

  const metrics: Metric[] = []

  // ---- CPU ----
  const cpuPct = isWin
    ? parseWindowsCpu(cpuRaw)
    : isMac
      ? parseMacCpu(cpuRaw)
      : parseLinuxCpu(cpuRaw)
  const cpuStatus = pctStatus(cpuPct)
  metrics.push({
    name: 'CPU 使用率',
    value: cpuPct == null ? '—' : cpuPct.toFixed(1) + ' %',
    normal: '< 70%',
    status: cpuStatus,
  })
  if (cpuStatus === 'error') suggestions.push('CPU 使用率过高，建议排查高占用进程并评估扩容。')
  if (cpuStatus === 'warn') suggestions.push('CPU 使用率偏高，建议持续观察。')

  // ---- 内存 ----
  let memUsedPct: number | null = null
  let memText = '—'
  if (isWin) {
    const m = parseWindowsMem(memRaw)
    if (m && m.totalKB > 0) {
      memUsedPct = ((m.totalKB - m.freeKB) / m.totalKB) * 100
      memText = `${gb((m.totalKB - m.freeKB) * 1024)} / ${gb(m.totalKB * 1024)} (${memUsedPct.toFixed(1)}%)`
    }
  } else if (isMac) {
    const m = parseMacMem(memRaw)
    if (m && m.totalBytes > 0) {
      memUsedPct = (m.usedBytes / m.totalBytes) * 100
      memText = `${gb(m.usedBytes)} / ${gb(m.totalBytes)} (${memUsedPct.toFixed(1)}%)`
    }
  } else {
    const m = parsePosixFree(memRaw)
    if (m && m.totalMB > 0) {
      // 用 available 列（含可回收 buff/cache）：直接用 free 会把健康机器误报成 90%+
      const usedPct = ((m.totalMB - m.availMB) / m.totalMB) * 100
      memUsedPct = usedPct
      memText = `${Math.round(m.totalMB - m.availMB)} / ${m.totalMB} MB (${usedPct.toFixed(1)}%)`
    }
  }
  const memStatus = pctStatus(memUsedPct, 80, 90)
  metrics.push({ name: '内存使用率', value: memText, normal: '< 80%', status: memStatus })
  if (memStatus === 'error') suggestions.push('内存压力极大，建议排查内存泄漏并扩容。')
  if (memStatus === 'warn') suggestions.push('内存使用率偏高，建议关注可用内存。')

  // ---- 磁盘 ----
  let diskPct: number | null = null
  let diskText = '—'
  if (isWin) {
    const d = parseWindowsDisk(diskRaw)
    if (d && d.usedBytes + d.freeBytes > 0) {
      diskPct = (d.usedBytes / (d.usedBytes + d.freeBytes)) * 100
      diskText = `${gb(d.usedBytes)} / ${gb(d.usedBytes + d.freeBytes)} (${diskPct.toFixed(1)}%)`
    }
  } else {
    const d = parsePosixDf(diskRaw)
    if (d && d.usedPct != null) {
      diskPct = d.usedPct
      diskText = `${d.used} / ${d.size} (${d.usedPct}%)`
    }
  }
  const diskStatus = pctStatus(diskPct, 80, 90)
  metrics.push({ name: '磁盘使用率 (系统盘)', value: diskText, normal: '< 80%', status: diskStatus })
  if (diskStatus === 'error') suggestions.push('磁盘即将写满，请立即清理或扩容。')
  if (diskStatus === 'warn') suggestions.push('磁盘使用率偏高，建议提前规划清理。')

  // ---- 运行时长 & 负载 ----
  let upText = '—'
  let loadText = '—'
  if (isWin) {
    const boot = parseWindowsBoot(upRaw)
    upText = days(boot != null ? Date.now() - boot : null)
  } else {
    const u = parsePosixUptime(upRaw)
    upText = u.up || '—'
    loadText = u.load.length ? u.load.join(' / ') : '—'
  }
  metrics.push({ name: '系统运行时长', value: upText, normal: '—', status: 'ok' })
  metrics.push({ name: '平均负载 (1/5/15m)', value: loadText, normal: '< 核数', status: 'unknown' })

  return {
    platform: isWin ? 'Windows' : isMac ? 'macOS' : 'Linux',
    host: hostname(),
    timestamp: new Date().toISOString(),
    metrics,
    suggestions,
  }
}
