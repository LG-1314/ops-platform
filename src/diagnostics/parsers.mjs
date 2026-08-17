// parsers.mjs — 纯函数解析系统命令输出（单真源，可被 Node 直接 require/import 验证）
// 设计原则：任何解析失败都返回 null，由上层降级为 unknown，绝不抛错崩溃。

// Windows: 两行数字 KB -> TotalVisibleMemorySize, FreePhysicalMemory
export function parseWindowsMem(out) {
  const nums = (out.match(/\d+/g) || []).map(Number)
  if (nums.length >= 2) {
    const totalKB = nums[0]
    const freeKB = nums[1]
    return { totalKB, freeKB, usedKB: totalKB - freeKB }
  }
  return null
}

// Windows: 标量百分比（LoadPercentage 平均）
export function parseWindowsCpu(out) {
  const m = out.match(/(\d+(\.\d+)?)/)
  return m ? Number(m[1]) : null
}

// Windows: Get-PSDrive C | ConvertTo-Json  -> { "Used":.., "Free":.. } 单位字节
export function parseWindowsDisk(out) {
  const m = out.match(/\{[^}]*\}/)
  if (!m) return null
  try {
    const j = JSON.parse(m[0])
    return { usedBytes: Number(j.Used), freeBytes: Number(j.Free) }
  } catch {
    return null
  }
}

// Windows: LastBootUpTime DateTime 字符串
export function parseWindowsBoot(out) {
  const t = Date.parse(out.trim())
  return isNaN(t) ? null : t
}

// POSIX(df -h /): 第二行 Filesystem Size Used Avail Use% Mounted
export function parsePosixDf(out) {
  const lines = out.trim().split('\n')
  if (lines.length < 2) return null
  const c = lines[1].split(/\s+/)
  return {
    size: c[1],
    used: c[2],
    avail: c[3],
    usedPct: c[4] ? parseInt(c[4], 10) : null,
  }
}

// POSIX(free -m): Mem: total used free shared buff/cache available
export function parsePosixFree(out) {
  const lines = out.trim().split('\n')
  const mem = lines.find((l) => l.startsWith('Mem'))
  if (!mem) return null
  const c = mem.split(/\s+/)
  return { totalMB: +c[1], usedMB: +c[2], freeMB: +c[3], availMB: +(c[6] || c[3]) }
}

// macOS: top -l1 -n0 | grep 'CPU usage' -> "CPU usage: 12.34% user, 3.45% sys, 84.21% idle"
export function parseMacCpu(out) {
  const idle = out.match(/(\d+\.?\d*)%\s*idle/)
  if (idle) return 100 - parseFloat(idle[1])
  return null
}

// Linux: top -bn1 | grep '%Cpu' -> "%Cpu(s):  3.2 us,  1.0 sy, ... 96.0 id"
export function parseLinuxCpu(out) {
  const idle = out.match(/(\d+\.?\d*)\s*id/)
  if (idle) return 100 - parseFloat(idle[1])
  return null
}

// macOS: top -l1 -n0 | grep PhysMem -> "PhysMem: 16G used (2G wired), 4G unused"
export function parseMacMem(out) {
  const used = out.match(/(\d+\.?\d*)\s*([GM])B?\s+used/)
  const unused = out.match(/(\d+\.?\d*)\s*([GM])B?\s+unused/)
  const toBytes = (m) => {
    if (!m) return null
    const v = parseFloat(m[1])
    return m[2] === 'G' ? v * 1024 ** 3 : v * 1024 ** 2
  }
  const u = toBytes(used)
  const f = toBytes(unused)
  if (u != null && f != null) return { usedBytes: u, freeBytes: f, totalBytes: u + f }
  return null
}

// POSIX(uptime): "13:45:01 up 3 days,  2:10,  1 user,  load average: 0.50, 0.30, 0.10"
export function parsePosixUptime(out) {
  const load = out.match(/load average:\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)/) || []
  const up = (out.match(/up\s+(.+?),\s+\d+\s+user/) || [])[1]
  return {
    up: up || null,
    load: load.slice(1).map(Number),
  }
}
