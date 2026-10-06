// AI 智能运维中台：对接任意 OpenAI 兼容协议的大模型服务（OpenAI / DeepSeek / 百炼 / 方舟 / 通义等）。
// 提供：① 自由对话 ② 上下文智能分析（告警/主机/巡检/日志/云资源）③ 巡检报告生成。
// 未配置 API Key 时返回清晰提示，绝不抛未捕获异常。
import { memoryStore } from '../store/memoryStore'
import { encrypt, decrypt } from '../utils/crypto'
import { getLatest } from './hostMetricsCache'
import { logger } from '../utils/logger'
import type { AiConfig, AiAgent, AiProviderDef, Alert, Asset } from '@shared/types'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** 平台运维上下文（随提问注入，让大模型基于真实数据回答） */
export type AiContextKind = 'alert' | 'host' | 'patrol' | 'log' | 'knowledge' | 'resource' | 'report'

/** 对外返回的脱敏配置 */
export interface SafeAiConfig {
  baseUrl: string
  model: string
  provider: string
  temperature: number
  enabled: boolean
  hasApiKey: boolean
}

/** 供应商预设表 */
export const AI_PROVIDERS: AiProviderDef[] = [
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1-mini'], authType: 'bearer' },
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-chat', 'deepseek-reasoner'], authType: 'bearer' },
  { id: 'qwen', label: '通义千问（百炼）', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['qwen-plus', 'qwen-max', 'qwen-turbo'], authType: 'bearer' },
  { id: 'doubao', label: '豆包（火山方舟）', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', models: ['ep-xxxxx'], authType: 'bearer' },
  { id: 'zhipu', label: '智谱', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-4-plus', 'glm-4-air', 'glm-4-flash'], authType: 'bearer' },
  { id: 'kimi', label: 'Moonshot（Kimi）', baseUrl: 'https://api.moonshot.cn/v1', models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'], authType: 'bearer' },
  { id: 'ollama', label: 'Ollama（本地部署）', baseUrl: 'http://localhost:11434', models: ['llama3', 'mistral', 'qwen2', 'deepseek-r1'], authType: 'none' },
]

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_MODEL = 'gpt-4o-mini'
const DEFAULT_TEMPERATURE = 0.4

function cfg(): AiConfig {
  const c = memoryStore.getAiConfig()
  if (!c) return { baseUrl: DEFAULT_BASE_URL, model: DEFAULT_MODEL, enabled: false, provider: 'openai', temperature: DEFAULT_TEMPERATURE }
  return c
}

/** 脱敏配置（前端展示用，不返回密钥明文） */
export function safeConfig(): SafeAiConfig {
  const c = cfg()
  return {
    baseUrl: c.baseUrl || DEFAULT_BASE_URL,
    model: c.model || DEFAULT_MODEL,
    provider: c.provider || 'openai',
    temperature: c.temperature ?? DEFAULT_TEMPERATURE,
    enabled: c.enabled,
    hasApiKey: Boolean(c.apiKeyEnc),
  }
}

/** 校验模型服务地址：仅允许 http(s) 协议；https 之外仅放行本机回环（Ollama 等本地推理），
 *  防止把 baseUrl 指向云元数据/内网服务做 SSRF 探测。 */
function validateBaseUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('API 地址格式无效')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('API 地址仅支持 http(s) 协议')
  }
  if (url.protocol === 'http:') {
    const host = url.hostname.toLowerCase()
    const loopback = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]'
    if (!loopback) throw new Error('非 https 的 API 地址仅允许本机回环地址（如 http://127.0.0.1:11434）')
  }
  return raw
}

/** 保存配置：apiKey 入站明文 → 加密落盘；未传 apiKey 则保留原密钥 */
export function saveConfig(input: { baseUrl?: string; apiKey?: string; model?: string; enabled?: boolean; provider?: string; temperature?: number }): SafeAiConfig {
  const prev = memoryStore.getAiConfig() || { baseUrl: DEFAULT_BASE_URL, model: DEFAULT_MODEL, enabled: false, provider: 'openai', temperature: DEFAULT_TEMPERATURE }
  const baseUrl = input.baseUrl?.trim() || prev.baseUrl || DEFAULT_BASE_URL
  validateBaseUrl(baseUrl)
  const next: AiConfig = {
    baseUrl,
    model: input.model?.trim() || prev.model || DEFAULT_MODEL,
    provider: input.provider || prev.provider || 'openai',
    temperature: input.temperature != null ? input.temperature : (prev.temperature ?? DEFAULT_TEMPERATURE),
    enabled: input.enabled ?? prev.enabled,
    apiKeyEnc: prev.apiKeyEnc,
  }
  if (input.apiKey) next.apiKeyEnc = encrypt(input.apiKey.trim())
  memoryStore.setAiConfig(next)
  return safeConfig()
}

function getApiKey(): string | undefined {
  const enc = cfg().apiKeyEnc
  if (!enc) return undefined
  try {
    return decrypt(enc)
  } catch {
    return undefined
  }
}

/** 探测当前配置是否可用（发一条最小请求）。返回 { ok, message } */
export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  const key = getApiKey()
  const c = cfg()
  if (c.provider !== 'ollama' && !key) return { ok: false, message: '未配置 API Key' }
  try {
    await chat([{ role: 'user', content: '回复"ok"两个字即可' }], { maxTokens: 8, temperature: 0 })
    return { ok: true, message: '连接成功' }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

interface ChatOptions {
  maxTokens?: number
  temperature?: number
}

/** 调用大模型 API，返回助手回复文本。兼容 OpenAI 协议与 Ollama /api/chat。 */
export async function chat(
  messages: ChatMessage[],
  opts: ChatOptions = {}
): Promise<string> {
  const c = cfg()
  const key = getApiKey()
  if (!c.enabled) throw new Error('AI 运维助手未启用：请先在「设置 → AI 大模型」中启用')
  if (c.provider !== 'ollama' && !key) throw new Error('未配置大模型 API Key：请先在「设置 → AI 大模型」中填写并保存')

  const base = (c.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')
  const isOllama = c.provider === 'ollama' || base.includes('localhost:11434') || base.includes('127.0.0.1:11434')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 45000)
  try {
    if (isOllama) {
      // Ollama /api/chat 协议
      const url = `${base}/api/chat`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: c.model || 'llama3',
          messages,
          stream: false,
          options: { temperature: opts.temperature ?? c.temperature ?? DEFAULT_TEMPERATURE, num_predict: opts.maxTokens ?? 1200 },
        }),
        signal: controller.signal,
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        logger.error(`[ai/ollama] http ${res.status}: ${body.slice(0, 300)}`)
        throw new Error(`Ollama 返回 ${res.status}：端口 11434 可达但模型未拉取或服务异常`)
      }
      const json = (await res.json()) as { message?: { content?: string }; error?: string }
      if (json.error) throw new Error(`Ollama 错误：${json.error}`)
      const text = json.message?.content?.trim()
      if (!text) throw new Error('Ollama 返回空内容')
      return text
    }

    // 标准 OpenAI 兼容协议
    const url = `${base}/chat/completions`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (key) headers['Authorization'] = `Bearer ${key}`
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: c.model || DEFAULT_MODEL,
        messages,
        max_tokens: opts.maxTokens ?? 1200,
        temperature: opts.temperature ?? c.temperature ?? DEFAULT_TEMPERATURE,
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      logger.error(`[ai] chat http ${res.status}: ${body.slice(0, 300)}`)
      throw new Error(`大模型服务返回 ${res.status}：${res.status === 401 ? 'API Key 无效或未授权' : res.status === 429 ? '请求过于频繁（限流）' : '服务异常'}`)
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
      error?: { message?: string }
    }
    if (json.error?.message) throw new Error(`大模型返回错误：${json.error.message}`)
    const text = json.choices?.[0]?.message?.content?.trim()
    if (!text) throw new Error('大模型返回空内容')
    return text
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('AI 请求超时（45s），请检查网络或降低问题复杂度')
    throw e
  } finally {
    clearTimeout(timer)
  }
}

/** 把平台上下文序列化为系统提示词片段 */
function contextPrompt(kind: AiContextKind, payload: Record<string, unknown>): string {
  const now = new Date().toLocaleString('zh-CN')
  switch (kind) {
    case 'alert': {
      const a = payload as unknown as Partial<Alert> & { assetName?: string }
      return [
        `你正在协助运维人员处理一条告警（当前时间 ${now}）：`,
        `- 级别：${a.level ?? '未知'}`,
        `- 标题：${a.title ?? '未知'}`,
        `- 详情：${a.message ?? ''}`,
        a.assetName ? `- 归属资产：${a.assetName}` : '',
        '请：① 评估严重程度与紧急度；② 列出最可能根因（按概率排序）；③ 给出 step-by-step 排查步骤；④ 给出安全的处置/修复建议与命令（注意生产环境需审批）。',
      ].filter(Boolean).join('\n')
    }
    case 'host': {
      const h = payload as Record<string, unknown>
      const lines = [
        `你正在协助诊断一台主机（当前时间 ${now}）：`,
        `- 名称：${h.name ?? '-'}（${h.host ?? ''}）`,
        `- 状态：${h.reachable ? '在线' : '离线/不可达'}（健康分 ${h.healthScore ?? '-'}）`,
        h.cpuPct != null ? `- CPU 使用率：${h.cpuPct}%` : '',
        h.memPct != null ? `- 内存使用率：${h.memPct}%` : '',
        h.diskPct != null ? `- 磁盘使用率：${h.diskPct}%` : '',
        h.load1 != null ? `- 系统负载 load1：${h.load1}` : '',
        '请给出：① 健康状态解读与风险评级；② 主要隐患与最可能问题；③ 建议的排查命令与处置步骤。',
      ]
      return lines.filter(Boolean).join('\n')
    }
    case 'patrol': {
      const p = payload as Record<string, unknown>
      return [
        `你正在分析一次智能巡检结果（当前时间 ${now}）：`,
        `- 任务：${p.name ?? '-'}`,
        `- 状态：${p.status ?? '-'}`,
        `- 摘要：${p.summary ?? '-'}`,
        '请：① 对巡检结果分级（优/良/中/差）并说明理由；② 列出需重点关注的高风险项；③ 给出整改优先级清单与建议。',
      ].filter(Boolean).join('\n')
    }
    case 'log': {
      return [
        `以下是运维日志片段（当前时间 ${now}），请智能清洗分析：`,
        `---日志开始---`,
        String(payload.text ?? ''),
        `---日志结束---`,
        '请：① 过滤无效/重复日志；② 归类故障类型；③ 指出最关键异常及可能根因；④ 给出处理建议。',
      ].join('\n')
    }
    case 'knowledge': {
      return [
        `你是一个企业运维知识库问答助手（当前时间 ${now}）。`,
        '请基于平台已有知识结合通用运维经验回答用户问题；答案要 step-by-step、可执行、安全，涉及高危操作需提醒审批。',
      ].join('\n')
    }
    case 'resource': {
      return [
        `你正在对云/集群资源做风险预警分析（当前时间 ${now}）。`,
        `资源信息：${JSON.stringify(payload)}`,
        '请：① 判断是否存在内存/磁盘/负载/带宽过载风险；② 给出风险等级与预计恶化时间窗口；③ 给出扩容/优化建议。',
      ].join('\n')
    }
    case 'report': {
      return [
        `你正在生成一份运维巡检/分析报告（当前时间 ${now}）。`,
        `平台数据：${JSON.stringify(payload)}`,
        '请生成结构化报告：① 总体状况；② 分项健康；③ 主要风险；④ 整改建议（按优先级）；⑤ 长期优化方向。要求条理清晰、可直接用于团队汇报。',
      ].join('\n')
    }
    default:
      return ''
  }
}

/** 智能分析：携带平台真实上下文提问 */
export async function analyze(kind: AiContextKind, payload: Record<string, unknown>): Promise<string> {
  const sys = `你是「运维全维度管理平台」的资深运维专家。回答使用简体中文，专业、简洁、可执行。${contextPrompt(kind, payload)}`
  return chat([{ role: 'system', content: sys }, { role: 'user', content: '请开始分析。' }])
}

/** 智能问答（知识库增强）：附上平台相关上下文再回答 */
export async function qa(userQuestion: string, relatedKnowledge?: string[]): Promise<string> {
  const sys = contextPrompt('knowledge', {})
  const kb = relatedKnowledge && relatedKnowledge.length
    ? `\n\n平台知识库相关条目（供参考）：\n${relatedKnowledge.slice(0, 5).join('\n---\n')}`
    : ''
  return chat([
    { role: 'system', content: sys },
    { role: 'user', content: `问题：${userQuestion}${kb}` },
  ])
}

/** 生成巡检报告（基于平台真实资产/告警/巡检数据） */
export async function generateReport(): Promise<string> {
  const assets = memoryStore.getAssets()
  const alerts = memoryStore.getAlerts().filter((a) => a.state !== 'resolved')
  const patrols = memoryStore.getPatrols()
  const summary = {
    资产总数: assets.length,
    在线: assets.filter((a) => a.reachable).length,
    离线: assets.filter((a) => a.reachable === false).length,
    活跃告警数: alerts.length,
    巡检任务数: patrols.length,
    资产健康分: assets.map((a) => ({ 名称: a.name, 状态: a.status, 健康分: a.healthScore })),
    近期告警: alerts.slice(0, 8).map((a) => ({ 级别: a.level, 标题: a.title, 状态: a.state })),
  }
  return analyze('report', summary as unknown as Record<string, unknown>)
}

/** 生成针对单台主机近期指标的诊断建议 */
export async function analyzeHostMetrics(asset: Asset): Promise<string> {
  const m = getLatest(asset.id)
  const payload: Record<string, unknown> = {
    name: asset.name,
    host: asset.host,
    reachable: asset.reachable,
    healthScore: asset.healthScore,
    status: asset.status,
    cpuPct: m && m.cpuIdle != null ? Math.max(0, Math.round(100 - m.cpuIdle)) : undefined,
    memPct: m && m.memTotalMb && m.memUsedMb != null ? Math.round((m.memUsedMb / m.memTotalMb) * 100) : undefined,
    diskPct: m && m.disk.length ? Math.max(...m.disk.map((d) => d.usedPct)) : undefined,
    load1: m?.load1,
    collectedAt: m?.collectedAt,
  }
  return analyze('host', payload)
}

export const aiService = { safeConfig, saveConfig, testConnection, chat, analyze, qa, generateReport, analyzeHostMetrics }

// —— AI 智能体（角色化运维专家）——

/** 全部智能体（含内置+自建） */
export function listAgents(): AiAgent[] {
  return memoryStore.getAiAgents()
}

function genAgentId(): string {
  return `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export function createAgent(input: Partial<AiAgent>): AiAgent {
  const now = new Date().toISOString()
  const agent: AiAgent = {
    id: input.id || genAgentId(),
    name: input.name || '未命名智能体',
    role: input.role || '运维助手',
    description: input.description || '',
    systemPrompt: input.systemPrompt || '你是一名资深运维专家，回答使用简体中文，专业、简洁、可执行。',
    icon: input.icon || 'qa',
    enabled: input.enabled ?? true,
    createdAt: now,
  }
  return memoryStore.addAiAgent(agent)
}

export function updateAgent(id: string, patch: Partial<AiAgent>): AiAgent | undefined {
  return memoryStore.updateAiAgent(id, patch)
}

export function removeAgent(id: string): boolean {
  return memoryStore.removeAiAgent(id)
}

/** 与指定智能体对话：注入角色系统提示词，可选携带平台上下文 */
export async function agentChat(
  agentId: string,
  messages: ChatMessage[],
  context?: { kind: AiContextKind; payload: Record<string, unknown> }
): Promise<string> {
  const agent = memoryStore.getAiAgents().find((a) => a.id === agentId)
  if (!agent) throw new Error('智能体不存在')
  if (!agent.enabled) throw new Error(`智能体「${agent.name}」已停用`)
  const sys = agent.systemPrompt
  let userContent = messages.map((m) => m.content).join('\n')
  if (context?.kind) {
    const ctx = contextPrompt(context.kind, context.payload || {})
    if (ctx) userContent = `${ctx}\n\n用户问题：${userContent}`
  }
  return chat([{ role: 'system', content: sys }, { role: 'user', content: userContent || '请介绍你的能力。' }])
}