import { Router } from 'express'
import { asyncHandler, ok, fail } from '../utils/response'
import { patrolService } from '../services/patrolService'
import { logger } from '../utils/logger'
import type { PatrolTask } from '@shared/types'

export const patrolsRouter = Router()

patrolsRouter.get('/', asyncHandler(async (_req, res) => {
  ok(res, patrolService.list())
}))

patrolsRouter.post('/', asyncHandler(async (req, res) => {
  ok(res, patrolService.create(req.body as Partial<PatrolTask>))
}))

patrolsRouter.get('/:id', asyncHandler(async (req, res) => {
  const t = patrolService.get(req.params.id)
  if (!t) return fail(res, 404, 'patrol not found')
  ok(res, t)
}))

patrolsRouter.put('/:id', asyncHandler(async (req, res) => {
  const t = patrolService.update(req.params.id, req.body as Partial<PatrolTask>)
  if (!t) return fail(res, 404, 'patrol not found')
  ok(res, t)
}))

patrolsRouter.delete('/:id', asyncHandler(async (req, res) => {
  const removed = patrolService.remove(req.params.id)
  if (!removed) return fail(res, 404, 'patrol not found')
  ok(res, { ok: true })
}))

patrolsRouter.post('/:id/run', asyncHandler(async (req, res) => {
  try {
    ok(res, patrolService.run(req.params.id))
  } catch (e) {
    logger.error(`[patrols] run failed: ${e instanceof Error ? e.stack || e.message : String(e)}`)
    fail(res, 404, '巡检任务不存在或运行失败')
  }
}))
