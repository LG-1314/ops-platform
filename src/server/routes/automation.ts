import { Router } from 'express'
import { asyncHandler, ok, fail } from '../utils/response'
import { automationService } from '../services/automationService'
import type { Incident, IncidentState } from '@shared/types'

export const automationRouter = Router()

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

automationRouter.get('/cicd', asyncHandler(async (_req, res) => {
  ok(res, automationService.cicd())
}))
