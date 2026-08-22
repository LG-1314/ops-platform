import { Router } from 'express'
import { requireUser } from '../services/authService'
import { asyncHandler, ok, fail } from '../utils/response'
import { alertService } from '../services/alertService'
import { paginate } from '../utils/paginate'
import type { Alert, AlertLevel, AlertState } from '@shared/types'

export const alertsRouter = Router()

// 用户级鉴权：所有路由需携带有效会话 token（与 users/cloud/ai 等路由一致）
alertsRouter.use(requireUser)

alertsRouter.get('/', asyncHandler(async (req, res) => {
  const level = typeof req.query.level === 'string' ? (req.query.level as AlertLevel) : undefined
  const state = typeof req.query.state === 'string' ? (req.query.state as AlertState) : undefined
  const assetId = typeof req.query.assetId === 'string' ? req.query.assetId : undefined
  ok(res, paginate(alertService.list(level, state, assetId), req.query as Record<string, unknown>))
}))

alertsRouter.post('/', asyncHandler(async (req, res) => {
  ok(res, alertService.create(req.body as Partial<Alert>))
}))

alertsRouter.patch('/:id', asyncHandler(async (req, res) => {
  const state =
    req.body && typeof req.body.state === 'string' ? (req.body.state as AlertState) : undefined
  if (!state) return fail(res, 400, 'state required')
  const a = alertService.patch(req.params.id, { state, ackedBy: req.body.ackedBy })
  if (!a) return fail(res, 404, 'alert not found')
  ok(res, a)
}))

// 标记已读（查看详情 / 主动标记）
alertsRouter.post('/:id/read', asyncHandler(async (req, res) => {
  const a = alertService.markRead(req.params.id)
  if (!a) return fail(res, 404, 'alert not found')
  ok(res, a)
}))

// 置顶 / 取消置顶
alertsRouter.post('/:id/pin', asyncHandler(async (req, res) => {
  const pinned = Boolean(req.body?.pinned)
  const a = alertService.setPinned(req.params.id, pinned)
  if (!a) return fail(res, 404, 'alert not found')
  ok(res, a)
}))

alertsRouter.delete('/:id', asyncHandler(async (req, res) => {
  const removed = alertService.remove(req.params.id)
  if (!removed) return fail(res, 404, 'alert not found')
  ok(res, { ok: true })
}))
