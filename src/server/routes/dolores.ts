import { Router } from 'express'
import { requireUser } from '../services/authService'
import { asyncHandler, ok } from '../utils/response'
import { doloresService } from '../services/doloresService'
import type { DoloresTool } from '@shared/types'

export const doloresRouter = Router()

// 用户级鉴权：所有路由需携带有效会话 token（与 users/cloud/ai 等路由一致）
doloresRouter.use(requireUser)

// 执行工具（真实操作：进程健康/内存同步/目录清理/日志/定时任务）
doloresRouter.post('/run', asyncHandler(async (req, res) => {
  const tool =
    req.body && typeof req.body.tool === 'string'
      ? (req.body.tool as DoloresTool)
      : 'health'
  ok(res, doloresService.run(tool))
}))

// 执行历史（最新在前）
doloresRouter.get('/history', asyncHandler(async (_req, res) => {
  ok(res, doloresService.history())
}))