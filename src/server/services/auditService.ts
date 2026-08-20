import { readJSONFile, writeJSONAtomic } from '../store/persist'
import { logger } from '../utils/logger'

// 操作审计日志：记录关键安全事件（终端连接、登录、改密等），
// 环形缓冲（最多 500 条）+ audit.json 持久化，供管理员通过 /api/audit 查看。

export interface AuditEntry {
  id: string
  at: string
  action: string
  username: string
  detail: string
}

const FILE = 'audit.json'
const MAX_ENTRIES = 500

const entries: AuditEntry[] = []

function genId(): string {
  return `aud-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

function load(): void {
  const raw = readJSONFile(FILE)
  if (Array.isArray(raw)) {
    for (const e of raw as AuditEntry[]) {
      if (e && typeof e === 'object' && e.action) entries.push(e)
    }
  }
}

// 模块加载即读取历史（单例，进程内仅一次）
load()

function persist(): void {
  writeJSONAtomic(FILE, entries.slice(0, MAX_ENTRIES))
}

export function record(action: string, username: string, detail = ''): void {
  entries.unshift({ id: genId(), at: new Date().toISOString(), action, username, detail })
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES
  persist()
  logger.info(`audit: ${action} by=${username} ${detail}`)
}

export function listAudit(): AuditEntry[] {
  return entries
}

export const auditService = { record, list: listAudit }
