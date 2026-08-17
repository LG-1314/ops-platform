import { Router } from 'express'
import { asyncHandler, ok } from '../utils/response'
import { guardrailService } from '../services/guardrailService'

export const guardrailsRouter = Router()

guardrailsRouter.post('/check', asyncHandler(async (req, res) => {
  const scope =
    req.body && typeof req.body.scope === 'string' ? req.body.scope : 'default'
  const target =
    req.body && typeof req.body.target === 'string' ? req.body.target : undefined
  ok(res, guardrailService.check(scope, target))
}))
