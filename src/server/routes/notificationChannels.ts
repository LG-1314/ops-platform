import { Router } from 'express'
import { asyncHandler, ok, fail } from '../utils/response'
import { notificationService } from '../services/notificationService'

export const notificationChannelsRouter = Router()

notificationChannelsRouter.get('/', asyncHandler(async (_req, res) => {
  ok(res, notificationService.list())
}))

notificationChannelsRouter.post('/', asyncHandler(async (req, res) => {
  try {
    ok(res, notificationService.create(req.body))
  } catch (e) {
    return fail(res, 400, (e as Error).message)
  }
}))

notificationChannelsRouter.put('/:id', asyncHandler(async (req, res) => {
  const updated = notificationService.update(req.params.id, req.body)
  if (!updated) return fail(res, 404, 'channel not found')
  ok(res, updated)
}))

notificationChannelsRouter.delete('/:id', asyncHandler(async (req, res) => {
  if (!notificationService.remove(req.params.id)) return fail(res, 404, 'channel not found')
  ok(res, { ok: true })
}))

// 连通性测试：POST /api/notification-channels/:id/test
notificationChannelsRouter.post('/:id/test', asyncHandler(async (req, res) => {
  const r = await notificationService.test(req.params.id)
  if (!r.ok) return fail(res, 502, r.message)
  ok(res, r)
}))
