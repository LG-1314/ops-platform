import { Router } from 'express'
import { asyncHandler, ok } from '../utils/response'
import { guardrailService } from '../services/guardrailService'

export const guardrailsRouter = Router()

// 执行防呆检查（真实规则引擎：危险命令/脱敏/跨设备/审批）
guardrailsRouter.post('/check', asyncHandler(async (req, res) => {
  const scope = typeof req.body?.scope === 'string' ? req.body.scope : 'default'
  const target = typeof req.body?.target === 'string' ? req.body.target : ''
  const content = typeof req.body?.content === 'string' ? req.body.content : undefined
  ok(res, guardrailService.check(scope, target, content))
}))

// 检查历史（最新在前）
guardrailsRouter.get('/history', asyncHandler(async (_req, res) => {
  ok(res, guardrailService.history())
}))