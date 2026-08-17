import { Router } from 'express'
import { asyncHandler, ok } from '../utils/response'
import { diagnosticService } from '../services/diagnosticService'

export const diagnosticsRouter = Router()

// 执行一次只读系统体检
diagnosticsRouter.post('/run', asyncHandler(async (req, res) => {
  const assetId =
    req.body && typeof req.body.assetId === 'string' ? req.body.assetId : undefined
  ok(res, diagnosticService.run(assetId))
}))

// 体检历史
diagnosticsRouter.get('/history', asyncHandler(async (req, res) => {
  const assetId =
    typeof req.query.assetId === 'string' ? req.query.assetId : undefined
  ok(res, diagnosticService.history(assetId))
}))
