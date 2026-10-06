import { Router } from 'express'
import { requireUser, requireAdmin } from '../services/authService'
import { asyncHandler, ok, fail } from '../utils/response'
import { assetService } from '../services/assetService'
import { monitorService } from '../services/monitorService'
import { probeAsset } from '../services/monitorService'
import { paginate } from '../utils/paginate'
import type { AssetType } from '@shared/types'
import { normalizeAssetInput, validateAssetConnectionTarget, validateAssetInput } from '../services/assetValidationService'

export const assetsRouter = Router()

// 用户级鉴权：所有路由需携带有效会话 token（与 users/cloud/ai 等路由一致）
assetsRouter.use(requireUser, requireAdmin)

// 列表（/assets 必须在 /assets/:id 之前；/discover 也需在 :id 之前）
assetsRouter.get('/', asyncHandler(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : undefined
  const type = typeof req.query.type === 'string' ? (req.query.type as AssetType) : undefined
  ok(res, paginate(assetService.list(q, type), req.query as Record<string, unknown>))
}))

assetsRouter.post('/discover', asyncHandler(async (_req, res) => {
  ok(res, assetService.discover())
}))

// 批量导入：逐条走与手工录入完全相同的校验；主机重复的行跳过而不是失败整批。
assetsRouter.post('/import', asyncHandler(async (req, res) => {
  const body = req.body as { items?: unknown }
  const items = body?.items
  if (!Array.isArray(items) || items.length === 0) return fail(res, 400, 'items 必须是非空数组')
  if (items.length > 500) return fail(res, 400, '单次最多导入 500 条')
  const existingHosts = new Set(
    assetService
      .list()
      .map((a) => (a.host || '').toLowerCase())
      .filter(Boolean)
  )
  const created: string[] = []
  const skipped: { name: string; reason: string }[] = []
  items.forEach((raw, i) => {
    const input = raw as Record<string, unknown>
    const lineNo = i + 1
    const invalid = validateAssetInput({ ...input, source: 'manual' }, true)
    if (invalid) {
      skipped.push({ name: String(input.name || `第 ${lineNo} 行`), reason: invalid })
      return
    }
    const host = String(input.host).trim()
    if (existingHosts.has(host.toLowerCase())) {
      skipped.push({ name: String(input.name || host), reason: '主机地址已存在' })
      return
    }
    try {
      const asset = assetService.create({ ...(input as object), source: 'manual' } as never)
      created.push(asset.id)
      existingHosts.add(host.toLowerCase())
    } catch (e) {
      skipped.push({ name: String(input.name || host), reason: e instanceof Error ? e.message : '写入失败' })
    }
  })
  ok(res, { total: items.length, created: created.length, skipped })
}))

// 未保存资产的连通性测试：有端口时进行 TCP 探测，否则进行 ICMP ping。
assetsRouter.post('/test-connection', asyncHandler(async (req, res) => {
  const input = req.body as Record<string, unknown>
  const validationError = validateAssetConnectionTarget(input)
  if (validationError) return fail(res, 400, validationError)

  const target = normalizeAssetInput(input)
  const checkedAt = new Date().toISOString()
  const result = await probeAsset({
    id: 'asset-connection-test',
    name: 'connection-test',
    type: 'server',
    host: target.host!,
    ip: target.ip,
    port: target.port,
    source: 'manual',
    tags: [],
    createdAt: checkedAt,
    healthScore: 0,
    status: 'unknown',
  })
  ok(res, { ...result, checkedAt })
}))

// 立即对全部资产做一次存活探测（定时任务之外的人工触发）
assetsRouter.post('/probe', asyncHandler(async (_req, res) => {
  await monitorService.scanOnce()
  ok(res, assetService.list())
}))

assetsRouter.get('/:id', asyncHandler(async (req, res) => {
  const a = assetService.get(req.params.id)
  if (!a) return fail(res, 404, 'asset not found')
  ok(res, a)
}))

assetsRouter.post('/', asyncHandler(async (req, res) => {
  const input = req.body as Record<string, unknown>
  const validationError = validateAssetInput(input, true)
  if (validationError) return fail(res, 400, validationError)
  ok(res, assetService.create(normalizeAssetInput(input)))
}))

assetsRouter.put('/:id', asyncHandler(async (req, res) => {
  const input = req.body as Record<string, unknown>
  const validationError = validateAssetInput(input)
  if (validationError) return fail(res, 400, validationError)
  const a = assetService.update(req.params.id, normalizeAssetInput(input))
  if (!a) return fail(res, 404, 'asset not found')
  ok(res, a)
}))

assetsRouter.delete('/:id', asyncHandler(async (req, res) => {
  const removed = assetService.remove(req.params.id)
  if (!removed) return fail(res, 404, 'asset not found')
  ok(res, { ok: true })
}))

// 对单台资产立即做一次存活探测
assetsRouter.post('/:id/probe', asyncHandler(async (req, res) => {
  const okScan = await monitorService.scanOne(req.params.id)
  if (!okScan) return fail(res, 404, 'asset not found')
  ok(res, assetService.get(req.params.id)!)
}))
