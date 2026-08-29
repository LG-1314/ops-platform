import { Router } from 'express'
import { asyncHandler, ok, fail } from '../utils/response'
import { requireUser, requireAdmin } from '../services/authService'
import { memoryStore } from '../store/memoryStore'
import { checkHealth } from '../services/dbService'
import type { DbConnection, DbType } from '@shared/types'

export const dbRouter = Router()

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

const defaultPort = (t: DbType): number => (t === 'mysql' ? 3306 : t === 'postgres' ? 5432 : 6379)

/** 数据库连接输入校验；创建与更新共用，避免非法端口或类型进入后台采集器。 */
export function validateDbConnectionInput(input: Record<string, unknown> | null | undefined): string | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return '请求数据格式不正确'
  if (input.name !== undefined && (typeof input.name !== 'string' || !input.name.trim())) return '名称不能为空'
  if (input.host !== undefined && (typeof input.host !== 'string' || !input.host.trim())) return '主机不能为空'
  if (input.dbType !== undefined && !['mysql', 'postgres', 'redis'].includes(String(input.dbType))) return '数据库类型不正确'
  if (input.port !== undefined && (!Number.isInteger(input.port) || Number(input.port) < 1 || Number(input.port) > 65535)) {
    return '端口必须是 1 到 65535 之间的整数'
  }
  return null
}

dbRouter.get('/', requireUser, requireAdmin, asyncHandler(async (_req, res) => {
  ok(res, memoryStore.getDbConnections())
}))

dbRouter.post('/', requireUser, requireAdmin, asyncHandler(async (req, res) => {
  const b = req.body as Partial<DbConnection>
  if (!b?.name || !b?.host || !b?.dbType) return fail(res, 400, 'name/host/dbType 必填')
  const validationError = validateDbConnectionInput(req.body as Record<string, unknown>)
  if (validationError) return fail(res, 400, validationError)
  const conn: DbConnection = {
    id: genId('db'),
    name: b.name,
    dbType: b.dbType as DbType,
    host: b.host,
    port: b.port || defaultPort(b.dbType as DbType),
    database: b.database,
    username: b.username,
    credentialId: b.credentialId,
    createdAt: new Date().toISOString(),
  }
  ok(res, memoryStore.addDbConnection(conn))
}))

dbRouter.put('/:id', requireUser, requireAdmin, asyncHandler(async (req, res) => {
  const validationError = validateDbConnectionInput(req.body as Record<string, unknown>)
  if (validationError) return fail(res, 400, validationError)
  const existing = memoryStore.getDbConnections().find((c) => c.id === req.params.id)
  if (!existing) return fail(res, 404, 'connection not found')
  const b = req.body as Partial<DbConnection>
  const patch: Partial<DbConnection> = {}
  if (b.name !== undefined) patch.name = String(b.name).trim()
  if (b.host !== undefined) patch.host = String(b.host).trim()
  if (b.dbType !== undefined) patch.dbType = b.dbType as DbType
  if (b.port !== undefined) patch.port = Number(b.port)
  if (b.database !== undefined) patch.database = b.database ? String(b.database).trim() : undefined
  if (b.username !== undefined) patch.username = b.username ? String(b.username).trim() : undefined
  if (b.credentialId !== undefined) patch.credentialId = b.credentialId || undefined
  const updated = memoryStore.updateDbConnection(req.params.id, patch)
  ok(res, updated)
}))

dbRouter.get('/:id/health', requireUser, requireAdmin, asyncHandler(async (req, res) => {
  const conn = memoryStore.getDbConnections().find((c) => c.id === req.params.id)
  if (!conn) return fail(res, 404, 'connection not found')
  ok(res, await checkHealth(conn))
}))

dbRouter.delete('/:id', requireUser, requireAdmin, asyncHandler(async (req, res) => {
  const removed = memoryStore.removeDbConnection(req.params.id)
  if (!removed) return fail(res, 404, 'connection not found')
  ok(res, { ok: true })
}))
