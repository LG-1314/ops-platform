import { Router } from 'express'
import { asyncHandler, ok, fail } from '../utils/response'
import { requireUser } from '../services/authService'
import { memoryStore } from '../store/memoryStore'
import { runCheck, runAllChecks } from '../services/serviceCheckService'
import type { ServiceCheck } from '@shared/types'

export const serviceChecksRouter = Router()

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

serviceChecksRouter.use(requireUser)

serviceChecksRouter.get('/', asyncHandler(async (_req, res) => {
  ok(res, memoryStore.getServiceChecks())
}))

serviceChecksRouter.post('/', asyncHandler(async (req, res) => {
  const b = req.body as Partial<ServiceCheck>
  if (!b?.name || !b?.assetId || !b?.checkType || !b?.serviceName) {
    return fail(res, 400, 'name/assetId/checkType/serviceName 必填')
  }
  if (b.checkType === 'port' && !b.port) return fail(res, 400, '端口检查必须指定端口号')
  const c: ServiceCheck = {
    id: genId('svcchk'),
    name: b.name,
    assetId: b.assetId,
    checkType: b.checkType,
    serviceName: b.serviceName,
    port: b.port,
    expectAlive: b.expectAlive ?? true,
    autoHeal: b.autoHeal ?? false,
    enabled: b.enabled ?? true,
    createdAt: new Date().toISOString(),
  }
  ok(res, memoryStore.addServiceCheck(c))
}))

serviceChecksRouter.put('/:id', asyncHandler(async (req, res) => {
  const patch = req.body as Partial<ServiceCheck>
  const updated = memoryStore.updateServiceCheck(req.params.id, {
    name: patch.name,
    assetId: patch.assetId,
    checkType: patch.checkType,
    serviceName: patch.serviceName,
    port: patch.port,
    expectAlive: patch.expectAlive,
    autoHeal: patch.autoHeal,
    enabled: patch.enabled,
  })
  if (!updated) return fail(res, 404, 'service check not found')
  ok(res, updated)
}))

serviceChecksRouter.delete('/:id', asyncHandler(async (req, res) => {
  const removed = memoryStore.removeServiceCheck(req.params.id)
  if (!removed) return fail(res, 404, 'service check not found')
  ok(res, { ok: true })
}))

// 立即执行单个检查
serviceChecksRouter.post('/:id/run', asyncHandler(async (req, res) => {
  const c = memoryStore.getServiceChecks().find((x) => x.id === req.params.id)
  if (!c) return fail(res, 404, 'service check not found')
  ok(res, await runCheck(c))
}))

// 批量执行全部启用的检查
serviceChecksRouter.post('/run-all', asyncHandler(async (_req, res) => {
  ok(res, await runAllChecks())
}))
