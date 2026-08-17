import { Router } from 'express'
import { asyncHandler, ok } from '../utils/response'
import { doloresService } from '../services/doloresService'
import type { DoloresTool } from '@shared/types'

export const doloresRouter = Router()

doloresRouter.post('/run', asyncHandler(async (req, res) => {
  const tool =
    req.body && typeof req.body.tool === 'string'
      ? (req.body.tool as DoloresTool)
      : 'health'
  ok(res, doloresService.run(tool))
}))
