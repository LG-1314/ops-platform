import { Router } from 'express'
import { asyncHandler, ok } from '../utils/response'
import { healthStore } from '../store/healthHistoryStore'
import { memoryStore } from '../store/memoryStore'
import { getLatest } from '../services/hostMetricsCache'

export const monitorRouter = Router()

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
  const alerts = memoryStore.getAlerts().filter((a) => a.state === 'active' || a.state === 'ack')

  const hosts = assets
    .filter((a) => a.type === 'server' || a.type === 'middleware')
    .map((a) => {
      const m = getLatest(a.id)
      return {
        id: a.id,
        name: a.name,
        host: a.host,
        port: a.port,
        credentialId: a.credentialId,
        status: a.status,
        reachable: a.reachable,
        healthScore: a.healthScore,
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

  ok(res, {
    totalAssets: assets.length,
    activeAlerts: alerts.length,
    hosts,
    dbCount: dbConns.length,
    clusterCount: clusters.length,
    checkedAt: new Date().toISOString(),
  })
}))