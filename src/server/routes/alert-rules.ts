import { Router } from 'express'
import { asyncHandler, ok, fail } from '../utils/response'
import { alertRuleService } from '../services/alertRuleService'

export const alertRulesRouter = Router()

alertRulesRouter.get('/', asyncHandler(async (_req, res) => {
  ok(res, alertRuleService.list())
}))

alertRulesRouter.post('/', asyncHandler(async (req, res) => {
  ok(res, alertRuleService.create(req.body))
}))

alertRulesRouter.put('/:id', asyncHandler(async (req, res) => {
  const r = alertRuleService.update(req.params.id, req.body)
  if (!r) return fail(res, 404, 'rule not found')
  ok(res, r)
}))

alertRulesRouter.delete('/:id', asyncHandler(async (req, res) => {
  const removed = alertRuleService.remove(req.params.id)
  if (!removed) return fail(res, 404, 'rule not found')
  ok(res, { ok: true })
}))

// 手动触发一次规则评估（定时任务也会周期性调用）
alertRulesRouter.post('/evaluate', asyncHandler(async (_req, res) => {
  const created = alertRuleService.evaluateAll()
  ok(res, { created })
}))
