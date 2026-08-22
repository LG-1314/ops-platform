import { Router } from 'express'
import { requireUser } from '../services/authService'
import { asyncHandler, ok } from '../utils/response'
import { dashboardService } from '../services/dashboardService'

export const dashboardRouter = Router()

// 用户级鉴权：所有路由需携带有效会话 token（与 users/cloud/ai 等路由一致）
dashboardRouter.use(requireUser)

dashboardRouter.get('/', asyncHandler(async (_req, res) => {
  ok(res, dashboardService.summarize())
}))
