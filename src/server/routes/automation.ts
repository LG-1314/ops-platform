import { Router } from 'express'
import { requireUser, requireAdmin } from '../services/authService'
import { asyncHandler, ok, fail } from '../utils/response'
import { automationService } from '../services/automationService'
import type { Incident, IncidentState, CicdPipeline } from '@shared/types'

export const automationRouter = Router()

// 用户级鉴权：所有路由需携带有效会话 token（与 users/cloud/ai 等路由一致）
automationRouter.use(requireUser, requireAdmin)

automationRouter.get('/incidents', asyncHandler(async (_req, res) => {
  ok(res, automationService.incidents())
}))

automationRouter.post('/incidents', asyncHandler(async (req, res) => {
  ok(res, automationService.createIncident(req.body as Partial<Incident>))
}))

automationRouter.patch('/incidents/:id', asyncHandler(async (req, res) => {
  const state =
    req.body && typeof req.body.state === 'string' ? (req.body.state as IncidentState) : undefined
  if (!state) return fail(res, 400, 'state required')
  const i = automationService.patchIncident(req.params.id, { state })
  if (!i) return fail(res, 404, 'incident not found')
  ok(res, i)
}))

// 编辑事故（标题 / 级别 / 负责人）
automationRouter.put('/incidents/:id', asyncHandler(async (req, res) => {
  const b = req.body as Partial<Incident>
  const i = automationService.patchIncident(req.params.id, {
    title: b.title,
    level: b.level,
    assignee: b.assignee,
  })
  if (!i) return fail(res, 404, 'incident not found')
  ok(res, i)
}))

automationRouter.delete('/incidents/:id', asyncHandler(async (req, res) => {
  const removed = automationService.removeIncident(req.params.id)
  if (!removed) return fail(res, 404, 'incident not found')
  ok(res, { ok: true })
}))

// CI/CD 流水线台账（真实 CRUD）
automationRouter.get('/cicd', asyncHandler(async (_req, res) => {
  ok(res, automationService.cicd())
}))

automationRouter.post('/cicd', asyncHandler(async (req, res) => {
  const b = req.body as Partial<CicdPipeline>
  if (!b?.name) return fail(res, 400, 'name required')
  ok(res, automationService.upsertPipeline(b))
}))

automationRouter.patch('/cicd/:id', asyncHandler(async (req, res) => {
  const i = automationService.patchPipeline(req.params.id, req.body as Partial<CicdPipeline>)
  if (!i) return fail(res, 404, 'pipeline not found')
  ok(res, i)
}))

automationRouter.delete('/cicd/:id', asyncHandler(async (req, res) => {
  const removed = automationService.removePipeline(req.params.id)
  if (!removed) return fail(res, 404, 'pipeline not found')
  ok(res, { ok: true })
}))
