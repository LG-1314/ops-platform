import { Router } from 'express'
import { requireUser } from '../services/authService'
import { asyncHandler, ok, fail } from '../utils/response'
import { metricSeriesStore } from '../store/metricSeriesStore'

export const metricsRouter = Router()

// 用户级鉴权：所有路由需携带有效会话 token（与 users/cloud/ai 等路由一致）
metricsRouter.use(requireUser)

// GET /api/metrics/history?assetId&from&to —— 查询某资产在时间范围内的历史指标（>200 点已降采样）
metricsRouter.get('/history', asyncHandler(async (req, res) => {
  const { assetId, from, to } = req.query as { assetId?: string; from?: string; to?: string }
  if (!assetId) return fail(res, 400, 'assetId 必填')
  ok(res, metricSeriesStore.query(assetId, from, to))
}))
