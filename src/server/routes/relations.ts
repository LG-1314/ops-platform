import { Router } from 'express'
import { requireUser } from '../services/authService'
import { asyncHandler, ok } from '../utils/response'
import { relationService } from '../services/relationService'

export const relationsRouter = Router()

// 用户级鉴权：所有路由需携带有效会话 token（与 users/cloud/ai 等路由一致）
relationsRouter.use(requireUser)

relationsRouter.get('/', asyncHandler(async (_req, res) => {
  ok(res, relationService.all())
}))

relationsRouter.get('/:asset', asyncHandler(async (req, res) => {
  ok(res, relationService.of(decodeURIComponent(req.params.asset)))
}))
