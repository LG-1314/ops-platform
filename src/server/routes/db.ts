import { Router } from 'express'
import { asyncHandler, ok, fail } from '../utils/response'
import { requireUser } from '../services/authService'
import { memoryStore } from '../store/memoryStore'
import { checkHealth } from '../services/dbService'
import type { DbConnection, DbType } from '@shared/types'

export const dbRouter = Router()

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

const defaultPort = (t: DbType): number => (t === 'mysql' ? 3306 : t === 'postgres' ? 5432 : 6379)

dbRouter.get('/', requireUser, asyncHandler(async (_req, res) => {
  ok(res, memoryStore.getDbConnections())
}))

dbRouter.post('/', requireUser, asyncHandler(async (req, res) => {
  const b = req.body as Partial<DbConnection>
  if (!b?.name || !b?.host || !b?.dbType) return fail(res, 400, 'name/host/dbType 必填')
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

dbRouter.get('/:id/health', requireUser, asyncHandler(async (req, res) => {
  const conn = memoryStore.getDbConnections().find((c) => c.id === req.params.id)
  if (!conn) return fail(res, 404, 'connection not found')
  ok(res, await checkHealth(conn))
}))

dbRouter.delete('/:id', requireUser, asyncHandler(async (req, res) => {
  const removed = memoryStore.removeDbConnection(req.params.id)
  if (!removed) return fail(res, 404, 'connection not found')
  ok(res, { ok: true })
}))
