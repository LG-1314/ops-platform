import { Router } from 'express'
import { asyncHandler, ok, fail } from '../utils/response'
import { requireUser } from '../services/authService'
import {
  safeConfig,
  saveConfig,
  testConnection,
  chat,
  analyze,
  qa,
  generateReport,
  analyzeHostMetrics,
  listAgents,
  createAgent,
  updateAgent,
  removeAgent,
  agentChat,
  AI_PROVIDERS,
  type AiContextKind,
  type ChatMessage,
} from '../services/aiService'
import { memoryStore } from '../store/memoryStore'
import { logger } from '../utils/logger'

export const aiRouter = Router()

// —— 智能体 CRUD ——
aiRouter.get('/agents', requireUser, asyncHandler(async (_req, res) => {
  ok(res, listAgents())
}))

aiRouter.post('/agents', requireUser, asyncHandler(async (req, res) => {
  try {
    ok(res, createAgent(req.body as Partial<import('@shared/types').AiAgent>))
  } catch (e) {
    fail(res, 400, '智能体操作失败')
  }
}))

aiRouter.put('/agents/:id', requireUser, asyncHandler(async (req, res) => {
  const a = updateAgent(req.params.id, req.body as Partial<import('@shared/types').AiAgent>)
  if (!a) return fail(res, 404, 'agent not found')
  ok(res, a)
}))

aiRouter.delete('/agents/:id', requireUser, asyncHandler(async (req, res) => {
  const removed = removeAgent(req.params.id)
  if (!removed) return fail(res, 404, 'agent not found')
  ok(res, { ok: true })
}))

// 与指定智能体对话（可携带平台上下文）
aiRouter.post('/agent-chat', requireUser, asyncHandler(async (req, res) => {
  const b = req.body as {
    agentId?: string
    messages?: ChatMessage[]
    context?: { kind: AiContextKind; payload: Record<string, unknown> }
  }
  if (!b.agentId) return fail(res, 400, 'agentId 必填')
  try {
    ok(res, { reply: await agentChat(b.agentId, Array.isArray(b.messages) ? b.messages : [], b.context) })
  } catch (e) {
    const msg = (e as Error).message
    logger.error(`[ai] agent-chat failed: ${msg}`)
    fail(res, 502, '智能体对话失败，请检查模型配置后重试')
  }
}))

// 供应商预设（前端展示：选择后自动填充 baseUrl / 推荐模型）
aiRouter.get('/providers', requireUser, asyncHandler(async (_req, res) => {
  ok(res, AI_PROVIDERS)
}))

// 当前配置（脱敏）
aiRouter.get('/config', requireUser, asyncHandler(async (_req, res) => {
  ok(res, safeConfig())
}))

// 保存配置
aiRouter.put('/config', requireUser, asyncHandler(async (req, res) => {
  const b = req.body as { baseUrl?: string; apiKey?: string; model?: string; enabled?: boolean; provider?: string; temperature?: number }
  ok(res, saveConfig(b))
}))

// 测试连接
aiRouter.post('/config/test', requireUser, asyncHandler(async (_req, res) => {
  try {
    ok(res, await testConnection())
  } catch (e) {
    fail(res, 502, '连接失败', '请检查 API 地址与密钥配置')
  }
}))

// 自由对话（可带上下文）
aiRouter.post('/chat', requireUser, asyncHandler(async (req, res) => {
  const b = req.body as { messages?: ChatMessage[]; context?: { kind: AiContextKind; payload: Record<string, unknown> } }
  try {
    let reply: string
    if (b.context && b.context.kind) {
      reply = await analyze(b.context.kind, b.context.payload || {})
    } else if (Array.isArray(b.messages) && b.messages.length) {
      reply = await chat(b.messages)
    } else {
      return fail(res, 400, '缺少 messages 或 context')
    }
    ok(res, { reply })
  } catch (e) {
    const msg = (e as Error).message
    logger.error(`[ai] chat failed: ${msg}`)
    fail(res, 502, 'AI 对话请求失败，请检查模型配置后重试')
  }
}))

// 智能问答（知识库增强）
aiRouter.post('/qa', requireUser, asyncHandler(async (req, res) => {
  const b = req.body as { question?: string; related?: string[] }
  if (!b.question?.trim()) return fail(res, 400, 'question 必填')
  try {
    ok(res, { reply: await qa(b.question, b.related) })
  } catch (e) {
    fail(res, 502, 'AI 问答请求失败，请检查模型配置后重试')
  }
}))

// 生成平台巡检报告
aiRouter.post('/report', requireUser, asyncHandler(async (_req, res) => {
  try {
    ok(res, { report: await generateReport() })
  } catch (e) {
    fail(res, 502, '报告生成失败，请检查模型配置后重试')
  }
}))

// 分析指定主机指标
aiRouter.post('/analyze-host', requireUser, asyncHandler(async (req, res) => {
  const assetId = typeof req.body?.assetId === 'string' ? req.body.assetId : ''
  const asset = memoryStore.getAssets().find((a) => a.id === assetId)
  if (!asset) return fail(res, 404, 'asset not found')
  try {
    ok(res, { reply: await analyzeHostMetrics(asset) })
  } catch (e) {
    fail(res, 502, '主机分析失败，请检查模型配置后重试')
  }
}))
