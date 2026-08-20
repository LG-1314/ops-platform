import { execSync } from 'node:child_process'
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

// 重要边界：体检对象恒为「运行本 App 的这台本机」（execSync 跑本机只读命令）。
// 远程主机指标请走 sshService.collectMetrics（主机页 SSH 采集），二者目标与管线彼此独立。

function sh(cmd: string, timeout = 20000): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout }).trim()
  } catch {
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

// 跨平台系统体检：只执行只读命令，解析为结构化指标并给出状态评估
export function diagnose(): DiagnoseResult {
  const plat = platform()
  const isWin = plat === 'win32'
  const isMac = plat === 'darwin'
  const metrics: Metric[] = []
  const suggestions: string[] = []

  // ---- CPU ----
  let cpuPct: number | null = null
  if (isWin) {
    cpuPct = parseWindowsCpu(
      sh(`powershell -NoProfile -Command "(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average"`)
    )
  } else if (isMac) {
    cpuPct = parseMacCpu(sh(`top -l1 -n0 | grep 'CPU usage'`))
  } else {
    cpuPct = parseLinuxCpu(sh(`top -bn1 | grep '%Cpu'`))
  }
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
    const m = parseWindowsMem(
      sh(`powershell -NoProfile -Command "(Get-CimInstance Win32_OperatingSystem).TotalVisibleMemorySize;(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory"`)
    )
    if (m && m.totalKB > 0) {
      memUsedPct = ((m.totalKB - m.freeKB) / m.totalKB) * 100
      memText = `${gb((m.totalKB - m.freeKB) * 1024)} / ${gb(m.totalKB * 1024)} (${memUsedPct.toFixed(1)}%)`
    }
  } else if (isMac) {
    const m = parseMacMem(sh(`top -l1 -n0 | grep PhysMem`))
    if (m && m.totalBytes > 0) {
      memUsedPct = (m.usedBytes / m.totalBytes) * 100
      memText = `${gb(m.usedBytes)} / ${gb(m.totalBytes)} (${memUsedPct.toFixed(1)}%)`
    }
  } else {
    const m = parsePosixFree(sh(`free -m`))
    if (m && m.totalMB > 0) {
      memUsedPct = ((m.totalMB - m.freeMB) / m.totalMB) * 100
      memText = `${m.usedMB} / ${m.totalMB} MB (${memUsedPct.toFixed(1)}%)`
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
    const d = parseWindowsDisk(
      sh(`powershell -NoProfile -Command "Get-PSDrive C | Select-Object Used,Free | ConvertTo-Json"`)
    )
    if (d && d.usedBytes + d.freeBytes > 0) {
      diskPct = (d.usedBytes / (d.usedBytes + d.freeBytes)) * 100
      diskText = `${gb(d.usedBytes)} / ${gb(d.usedBytes + d.freeBytes)} (${diskPct.toFixed(1)}%)`
    }
  } else {
    const d = parsePosixDf(sh(`df -h /`))
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
    const boot = parseWindowsBoot(sh(`powershell -NoProfile -Command "(Get-CimInstance Win32_OperatingSystem).LastBootUpTime"`))
    upText = days(boot != null ? Date.now() - boot : null)
  } else {
    const u = parsePosixUptime(sh(`uptime`))
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
