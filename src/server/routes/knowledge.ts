import { Router } from 'express'
import { requireUser } from '../services/authService'
import { asyncHandler, ok, fail } from '../utils/response'
import { knowledgeService } from '../services/knowledgeService'
import type { KnowledgeHit } from '@shared/types'

export const knowledgeRouter = Router()

// 用户级鉴权：所有路由需携带有效会话 token（与 users/cloud/ai 等路由一致）
knowledgeRouter.use(requireUser)

// 内置 FAQ 检索
knowledgeRouter.get('/search', asyncHandler(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : ''
  ok(res, knowledgeService.search(q))
}))

// 自维护知识列表
knowledgeRouter.get('/', asyncHandler(async (_req, res) => {
  ok(res, knowledgeService.listLocal())
}))

// 自维护知识创建
knowledgeRouter.post('/', asyncHandler(async (req, res) => {
  ok(res, knowledgeService.create(req.body as Partial<KnowledgeHit>))
}))

// 自维护知识更新
knowledgeRouter.put('/:id', asyncHandler(async (req, res) => {
  const k = knowledgeService.update(req.params.id, req.body as Partial<KnowledgeHit>)
  if (!k) return fail(res, 404, 'knowledge not found')
  ok(res, k)
}))

// 自维护知识删除
knowledgeRouter.delete('/:id', asyncHandler(async (req, res) => {
  const removed = knowledgeService.remove(req.params.id)
  if (!removed) return fail(res, 404, 'knowledge not found')
  ok(res, { ok: true })
}))

// 自维护知识详情
knowledgeRouter.get('/:id', asyncHandler(async (req, res) => {
  const k = knowledgeService.getById(req.params.id)
  if (!k) return fail(res, 404, 'knowledge not found')
  ok(res, k)
}))
