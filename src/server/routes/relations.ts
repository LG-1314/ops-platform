import { Router } from 'express'
import { asyncHandler, ok } from '../utils/response'
import { relationService } from '../services/relationService'

export const relationsRouter = Router()

relationsRouter.get('/', asyncHandler(async (_req, res) => {
  ok(res, relationService.all())
}))

relationsRouter.get('/:asset', asyncHandler(async (req, res) => {
  ok(res, relationService.of(decodeURIComponent(req.params.asset)))
}))
