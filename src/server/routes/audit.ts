import { Router } from 'express'
import { asyncHandler, ok } from '../utils/response'
import { requireUser, requireAdmin } from '../services/authService'
import { auditService } from '../services/auditService'

// 审计日志查看：仅管理员可读（终端连接 / 登录 / 改密等安全事件）。
export const auditRouter = Router()

auditRouter.get('/', requireUser, requireAdmin, asyncHandler(async (_req, res) => {
  ok(res, auditService.list())
}))
