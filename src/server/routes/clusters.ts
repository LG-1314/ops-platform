import { Router } from 'express'
import { asyncHandler, ok, fail } from '../utils/response'
import { memoryStore } from '../store/memoryStore'
import { detail as k8sDetail } from '../services/k8sService'
import type { ClusterInfo } from '@shared/types'

export const clustersRouter = Router()

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

clustersRouter.get('/', asyncHandler(async (_req, res) => {
  ok(res, memoryStore.getClusters())
}))

clustersRouter.post('/', asyncHandler(async (req, res) => {
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
clustersRouter.get('/:id', asyncHandler(async (req, res) => {
  const cluster = memoryStore.getClusters().find((c) => c.id === req.params.id)
  if (!cluster) return fail(res, 404, 'cluster not found')
  try {
    const d = await k8sDetail(cluster)
    memoryStore.addCluster(d.cluster) // upsert 连通性/健康分
    ok(res, d)
  } catch (e) {
    fail(res, 502, (e as Error).message)
  }
}))

clustersRouter.post('/:id/scan', asyncHandler(async (req, res) => {
  const cluster = memoryStore.getClusters().find((c) => c.id === req.params.id)
  if (!cluster) return fail(res, 404, 'cluster not found')
  try {
    const d = await k8sDetail(cluster)
    memoryStore.addCluster(d.cluster)
    ok(res, d)
  } catch (e) {
    fail(res, 502, (e as Error).message)
  }
}))
