import { Router } from 'express'
import { asyncHandler, ok, fail } from '../utils/response'
import { requireUser } from '../services/authService'
import { memoryStore } from '../store/memoryStore'
import { listResources } from '../services/cloudService'
import { logger } from '../utils/logger'
import type { CloudAccount, CloudProvider } from '@shared/types'

export const cloudRouter = Router()

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

cloudRouter.get('/', requireUser, asyncHandler(async (_req, res) => {
  ok(res, memoryStore.getCloudAccounts())
}))

cloudRouter.post('/', requireUser, asyncHandler(async (req, res) => {
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

cloudRouter.get('/:id/resources', requireUser, asyncHandler(async (req, res) => {
  const acc = memoryStore.getCloudAccounts().find((a) => a.id === req.params.id)
  if (!acc) return fail(res, 404, 'account not found')
  try {
    ok(res, await listResources(acc))
  } catch (e) {
    logger.error(`[cloud] listResources failed: ${e instanceof Error ? e.stack || e.message : String(e)}`)
    fail(res, 502, '云账号资源拉取失败，请检查凭据与网络')
  }
}))

cloudRouter.delete('/:id', requireUser, asyncHandler(async (req, res) => {
  const removed = memoryStore.removeCloudAccount(req.params.id)
  if (!removed) return fail(res, 404, 'account not found')
  ok(res, { ok: true })
}))
