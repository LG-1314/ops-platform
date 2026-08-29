import { Router } from 'express'
import { asyncHandler, ok, fail } from '../utils/response'
import { requireUser, requireAdmin } from '../services/authService'
import { memoryStore } from '../store/memoryStore'
import { diffResources, listResources } from '../services/cloudService'
import { logger } from '../utils/logger'
import type { CloudAccount, CloudProvider, CloudChangeLog } from '@shared/types'

export const cloudRouter = Router()

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

cloudRouter.get('/', requireUser, requireAdmin, asyncHandler(async (_req, res) => {
  ok(res, memoryStore.getCloudAccounts())
}))

cloudRouter.post('/', requireUser, requireAdmin, asyncHandler(async (req, res) => {
  const b = req.body as Partial<CloudAccount>
  if (!b?.name || !b?.provider) return fail(res, 400, 'name/provider 必填')
  const acc: CloudAccount = {
    id: genId('cloud'),
    name: b.name,
    provider: b.provider as CloudProvider,
    region: b.region,
    credentialId: b.credentialId,
    createdAt: new Date().toISOString(),
  }
  ok(res, memoryStore.addCloudAccount(acc))
}))

cloudRouter.get('/:id/resources', requireUser, requireAdmin, asyncHandler(async (req, res) => {
  const acc = memoryStore.getCloudAccounts().find((a) => a.id === req.params.id)
  if (!acc) return fail(res, 404, 'account not found')
  try {
    const fresh = await listResources(acc)
    // 与上次快照 diff，落一份变更日志（新增/下线/规格或状态变化）
    const prev = memoryStore.getCloudSnapshot(acc.id) || []
    const changes: CloudChangeLog[] = diffResources(prev, fresh, acc.id, acc.name, () => genId('cclog'))
    memoryStore.addCloudChanges(changes)
    memoryStore.setCloudSnapshot(acc.id, fresh)
    memoryStore.updateCloudAccount(acc.id, { lastSyncAt: new Date().toISOString() })
    ok(res, fresh)
  } catch (e) {
    logger.error(`[cloud] listResources failed: ${e instanceof Error ? e.stack || e.message : String(e)}`)
    fail(res, 502, '云账号资源拉取失败，请检查凭据与网络')
  }
}))

// 变更日志（时间倒序，可选按账号过滤）
cloudRouter.get('/:id/changes', requireUser, requireAdmin, asyncHandler(async (req, res) => {
  ok(res, memoryStore.getCloudChanges(req.params.id))
}))

// 全量变更日志（跨账号）
cloudRouter.get('/changes/all', requireUser, requireAdmin, asyncHandler(async (_req, res) => {
  ok(res, memoryStore.getCloudChanges())
}))

cloudRouter.delete('/:id', requireUser, requireAdmin, asyncHandler(async (req, res) => {
  const removed = memoryStore.removeCloudAccount(req.params.id)
  if (!removed) return fail(res, 404, 'account not found')
  ok(res, { ok: true })
}))

cloudRouter.put('/:id', requireUser, requireAdmin, asyncHandler(async (req, res) => {
  const b = req.body as Partial<CloudAccount>
  const updated = memoryStore.updateCloudAccount(req.params.id, {
    name: b.name,
    provider: b.provider,
    region: b.region,
    credentialId: b.credentialId,
  })
  if (!updated) return fail(res, 404, 'account not found')
  ok(res, updated)
}))
