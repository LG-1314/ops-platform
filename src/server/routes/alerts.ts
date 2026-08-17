import { Router } from 'express'
import { asyncHandler, ok, fail } from '../utils/response'
import { alertService } from '../services/alertService'
import type { Alert, AlertLevel, AlertState } from '@shared/types'

export const alertsRouter = Router()

alertsRouter.get('/', asyncHandler(async (req, res) => {
  const level = typeof req.query.level === 'string' ? (req.query.level as AlertLevel) : undefined
  const state = typeof req.query.state === 'string' ? (req.query.state as AlertState) : undefined
  const assetId = typeof req.query.assetId === 'string' ? req.query.assetId : undefined
  ok(res, alertService.list(level, state, assetId))
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

alertsRouter.delete('/:id', asyncHandler(async (req, res) => {
  const removed = alertService.remove(req.params.id)
  if (!removed) return fail(res, 404, 'alert not found')
  ok(res, { ok: true })
}))
