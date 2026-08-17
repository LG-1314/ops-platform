import { Router } from 'express'
import { asyncHandler, ok, fail } from '../utils/response'
import { knowledgeService } from '../services/knowledgeService'
import type { KnowledgeHit } from '@shared/types'

export const knowledgeRouter = Router()

// 内置 FAQ 检索
knowledgeRouter.get('/search', asyncHandler(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : ''
  ok(res, knowledgeService.search(q))
}))

// 自维护知识创建（P2 占位）
knowledgeRouter.post('/', asyncHandler(async (req, res) => {
  ok(res, knowledgeService.create(req.body as Partial<KnowledgeHit>))
}))

// 自维护知识详情
knowledgeRouter.get('/:id', asyncHandler(async (req, res) => {
  const k = knowledgeService.getById(req.params.id)
  if (!k) return fail(res, 404, 'knowledge not found')
  ok(res, k)
}))
