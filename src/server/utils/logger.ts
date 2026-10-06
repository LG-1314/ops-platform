import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// 轻量服务端日志：按天分文件 + 大小轮转，零依赖。
// 写至 OPS_DATA_DIR/logs（无则回退系统临时目录）。避免引入 pino/winston 等重量依赖。
// 与 main.ts 的 ops-platform-*.log（启动/崩溃/渲染）互补：这里承载能力总线运行期日志。

const MAX_FILE_BYTES = 5 * 1024 * 1024 // 单文件 5MB 触发轮转
const MAX_ROTATIONS = 3 // 保留 ops-YYYY-MM-DD、.1、.2、.3

function logDir(): string {
  const base = process.env.OPS_DATA_DIR || os.tmpdir()
  return path.join(base, 'logs')
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function rotateIfNeeded(filePath: string): void {
  try {
    const stat = fs.statSync(filePath)
    if (stat.size < MAX_FILE_BYTES) return
    for (let i = MAX_ROTATIONS; i >= 1; i -= 1) {
      const src = i === 1 ? filePath : `${filePath}.${i - 1}`
      const dst = `${filePath}.${i}`
      if (fs.existsSync(src)) fs.renameSync(src, dst)
    }
  } catch {
    /* 文件不存在等，忽略 */
  }
}

/** 折叠换行/控制字符：用户可控字符串（主机名、错误消息等）不得伪造独立日志行。
 *  逐字符过滤而非正则（控制字符正则触发 no-control-regex，且语义相同）。 */
export function sanitizeLogText(input: string, maxLen = 8000): string {
  let out = ''
  for (const ch of String(input)) {
    const code = ch.codePointAt(0)
    out += code !== undefined && (code < 0x20 || code === 0x7f) ? '\\n' : ch
  }
  return out.slice(0, maxLen)
}

function write(level: string, message: string): void {
  try {
    const dir = logDir()
    fs.mkdirSync(dir, { recursive: true })
    const filePath = path.join(dir, `ops-${today()}.log`)
    rotateIfNeeded(filePath)
    const line = `${new Date().toISOString()} [${level}] ${sanitizeLogText(message)}\n`
    fs.appendFileSync(filePath, line, 'utf8')
  } catch {
    /* 日志写失败绝不拖垮业务；回退 stderr 供调试 */
    // eslint-disable-next-line no-console
    console.error(`[logger:write-fail] ${level} ${message}`)
  }
}

export const logger = {
  info: (m: string): void => write('INFO', m),
  warn: (m: string): void => write('WARN', m),
  error: (m: string): void => write('ERROR', m),
}
