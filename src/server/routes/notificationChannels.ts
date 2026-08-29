import { Router } from 'express'
import { requireUser, requireAdmin } from '../services/authService'
import { asyncHandler, ok, fail } from '../utils/response'
import { notificationService } from '../services/notificationService'

export const notificationChannelsRouter = Router()

// 用户级鉴权：所有路由需携带有效会话 token（与 users/cloud/ai 等路由一致）
notificationChannelsRouter.use(requireUser, requireAdmin)

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
