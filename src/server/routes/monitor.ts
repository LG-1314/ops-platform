import { Router } from 'express'
import { requireUser } from '../services/authService'
import { asyncHandler, ok } from '../utils/response'
import { healthStore } from '../store/healthHistoryStore'
import { memoryStore } from '../store/memoryStore'
import { getLatest } from '../services/hostMetricsCache'
import type { Alert, Asset, ClusterInfo, DbConnection, HostMetricSample } from '@shared/types'

export const monitorRouter = Router()

function displayHealthScore(asset: Asset): number | null {
  return asset.reachable === true ? asset.healthScore : null
}

export function buildMonitorSummary(
  assets: Asset[],
  dbConns: DbConnection[],
  clusters: ClusterInfo[],
  alerts: Alert[],
  latestMetric: (assetId: string) => HostMetricSample | undefined = getLatest,
  checkedAt = new Date().toISOString()
) {
  const activeAlerts = alerts.filter((a) => a.state === 'active' || a.state === 'ack')
  const hosts = assets
    .filter((a) => a.type === 'server' || a.type === 'middleware')
    .map((a) => {
      const m = latestMetric(a.id)
      return {
        id: a.id,
        name: a.name,
        host: a.host,
        port: a.port,
        credentialId: a.credentialId,
        status: a.status,
        statusReason: a.statusReason,
        reachable: a.reachable,
        healthScore: displayHealthScore(a),
        latencyMs: a.latencyMs,
        lastCheckAt: a.lastCheckAt,
        cpuPct: m && m.cpuIdle != null ? Math.max(0, Math.round(100 - m.cpuIdle)) : undefined,
        memPct: m && m.memTotalMb && m.memUsedMb != null ? Math.round((m.memUsedMb / m.memTotalMb) * 100) : undefined,
        diskPct: m && m.disk.length > 0 ? Math.max(...m.disk.map((d) => d.usedPct)) : undefined,
        netRx: m?.network?.rxRateKbps,
        netTx: m?.network?.txRateKbps,
        collectedAt: m?.collectedAt,
      }
    })

  return {
    totalAssets: assets.length,
    activeAlerts: activeAlerts.length,
    hosts,
    dbCount: dbConns.length,
    clusterCount: clusters.length,
    checkedAt,
  }
}

// 用户级鉴权：所有路由需携带有效会话 token（与 users/cloud/ai 等路由一致）
monitorRouter.use(requireUser)

// DB/K8s 健康时序查询
// GET /api/monitor/health-history?kind=db&assetId=xxx&from=&to=
monitorRouter.get('/health-history', asyncHandler(async (req, res) => {
  const kind = req.query.kind === 'cluster' ? 'cluster' : 'db'
  const assetId = typeof req.query.assetId === 'string' ? req.query.assetId : ''
  const from = typeof req.query.from === 'string' ? req.query.from : undefined
  const to = typeof req.query.to === 'string' ? req.query.to : undefined
  if (!assetId) return ok(res, [])
  ok(res, healthStore.queryHealth(kind, assetId, from, to))
}))

// 监控大盘聚合数据
// GET /api/monitor/summary —— 主机实时指标 + DB 健康 + 集群健康 一站式汇总
monitorRouter.get('/summary', asyncHandler(async (_req, res) => {
  const assets = memoryStore.getAssets()
  const dbConns = memoryStore.getDbConnections()
  const clusters = memoryStore.getClusters()
  const alerts = memoryStore.getAlerts()

  ok(res, buildMonitorSummary(assets, dbConns, clusters, alerts))
}))
