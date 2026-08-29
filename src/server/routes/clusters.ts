import { Router } from 'express'
import { asyncHandler, ok, fail } from '../utils/response'
import { requireUser, requireAdmin } from '../services/authService'
import { memoryStore } from '../store/memoryStore'
import { detail as k8sDetail, diagnose as k8sDiagnose } from '../services/k8sService'
import { paginate } from '../utils/paginate'
import { logger } from '../utils/logger'
import type { ClusterInfo } from '@shared/types'

export const clustersRouter = Router()

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

clustersRouter.get('/', requireUser, requireAdmin, asyncHandler(async (req, res) => {
  ok(res, paginate(memoryStore.getClusters(), req.query as Record<string, unknown>))
}))

clustersRouter.post('/', requireUser, requireAdmin, asyncHandler(async (req, res) => {
  const b = req.body as Partial<ClusterInfo>
  if (!b?.name || !b?.endpoint) return fail(res, 400, 'name/endpoint 必填')
  const c: ClusterInfo = {
    id: genId('cluster'),
    name: b.name,
    endpoint: b.endpoint,
    connected: false,
    nodeCount: 0,
    healthScore: 0,
    status: 'unknown',
    credentialId: b.credentialId,
    authType: b.authType,
  }
  ok(res, memoryStore.addCluster(c))
}))

// 拉取集群真实详情（节点/工作负载），并回写连通性与健康分
clustersRouter.get('/:id', requireUser, requireAdmin, asyncHandler(async (req, res) => {
  const cluster = memoryStore.getClusters().find((c) => c.id === req.params.id)
  if (!cluster) return fail(res, 404, 'cluster not found')
  try {
    const d = await k8sDetail(cluster)
    memoryStore.addCluster(d.cluster) // upsert 连通性/健康分
    ok(res, d)
  } catch (e) {
    // 安全：对外只给通用文案，原始错误仅服务端日志
    logger.error(`[clusters] detail failed: ${e instanceof Error ? e.stack || e.message : String(e)}`)
    fail(res, 502, '集群连接失败，请检查 endpoint / 凭据 / 网络')
  }
}))

clustersRouter.post('/:id/scan', requireUser, requireAdmin, asyncHandler(async (req, res) => {
  const cluster = memoryStore.getClusters().find((c) => c.id === req.params.id)
  if (!cluster) return fail(res, 404, 'cluster not found')
  try {
    const d = await k8sDetail(cluster)
    memoryStore.addCluster(d.cluster)
    ok(res, d)
  } catch (e) {
    logger.error(`[clusters] scan failed: ${e instanceof Error ? e.stack || e.message : String(e)}`)
    fail(res, 502, '集群连接失败，请检查 endpoint / 凭据 / 网络')
  }
}))

// 连接一键自检：逐项检测 endpoint/DNS/端口/证书/凭据/API Server，永不 500（单项失败自报告）
clustersRouter.post('/:id/diagnose', requireUser, requireAdmin, asyncHandler(async (req, res) => {
  const cluster = memoryStore.getClusters().find((c) => c.id === req.params.id)
  if (!cluster) return fail(res, 404, 'cluster not found')
  ok(res, { items: await k8sDiagnose(cluster) })
}))

// 更新集群（名称 / endpoint / 关联凭据 / 认证类型）
clustersRouter.put('/:id', requireUser, requireAdmin, asyncHandler(async (req, res) => {
  const patch = req.body as Partial<ClusterInfo>
  const updated = memoryStore.updateCluster(req.params.id, {
    name: patch.name,
    endpoint: patch.endpoint,
    credentialId: patch.credentialId,
    authType: patch.authType,
  })
  if (!updated) return fail(res, 404, 'cluster not found')
  ok(res, updated)
}))

// 删除集群
clustersRouter.delete('/:id', requireUser, requireAdmin, asyncHandler(async (req, res) => {
  const removed = memoryStore.removeCluster(req.params.id)
  if (!removed) return fail(res, 404, 'cluster not found')
  ok(res, { ok: true })
}))
