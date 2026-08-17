import { Router } from 'express'
import { asyncHandler, ok } from '../utils/response'
import { dashboardService } from '../services/dashboardService'

export const dashboardRouter = Router()

dashboardRouter.get('/', asyncHandler(async (_req, res) => {
  ok(res, dashboardService.summarize())
}))
