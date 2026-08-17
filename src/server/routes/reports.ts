import { Router } from 'express'
import { asyncHandler, ok } from '../utils/response'
import { reportService } from '../services/reportService'
import type { ReportRequest } from '@shared/types'

export const reportsRouter = Router()

reportsRouter.post('/export', asyncHandler(async (req, res) => {
  ok(res, reportService.export(req.body as ReportRequest))
}))
