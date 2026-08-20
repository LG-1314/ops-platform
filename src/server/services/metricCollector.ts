import { memoryStore } from '../store/memoryStore'
import { credentialService } from './credentialService'
import { collectMetrics } from './sshService'
import { checkHealth } from './dbService'
import { detail as clusterDetail } from './k8sService'
import { pushHealth } from '../store/healthHistoryStore'

// 后台周期采集器：遍历「关联了 SSH 凭据」的资产，采集指标并写入最新缓存 + 时序；
// 同时周期采集数据库连接健康与 K8s 集群健康（健康时序）。并发受限、单资产失败不影响整体。
const CONCURRENCY = 5
const INTERVAL_MS = 60000

let running = false
let timers: ReturnType<typeof setInterval>[] = []

/** 采集单个资产（按资产 id 写入时序，与手动采集共用同一历史）。路由与采集器共用此单一真源。 */
export async function collectAsset(assetId: string): Promise<void> {
  const asset = memoryStore.getAssets().find((a) => a.id === assetId)
  if (!asset || !asset.credentialId) return
  const secret = credentialService.decrypt(asset.credentialId)
  if (!secret) return
  await collectMetrics(
    {
      host: asset.host,
      port: asset.port,
      username: secret.username,
      password: secret.password,
      privateKey: secret.privateKey,
    },
    asset.id
  )
}

async function collectAll(): Promise<void> {
  if (running) return
  running = true
  try {
    const assets = memoryStore.getAssets().filter((a) => a.credentialId)
    const queue = [...assets]
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) {
        const asset = queue.shift()
        if (!asset) break
        try {
          await collectAsset(asset.id)
        } catch {
          /* 单资产采集失败不影响其余 */
        }
      }
    })
    await Promise.all(workers)
  } finally {
    running = false
  }
}

/** 采集所有数据库连接的健康状态（写入健康时序） */
async function collectDbHealths(): Promise<void> {
  const conns = memoryStore.getDbConnections()
  await Promise.all(
    conns.map(async (c) => {
      try {
        const h = await checkHealth(c)
        pushHealth({
          assetId: c.id,
          kind: 'db',
          checkedAt: h.checkedAt,
          status: h.connected ? 'ok' : 'error',
          score: h.connected ? Math.max(0, 100 - h.metrics.filter((m) => m.status === 'warn').length * 10) : 0,
        })
      } catch {
        // 单 DB 失败不影响整体
      }
    })
  )
}

/** 采集所有 K8s 集群的健康状态（写入健康时序） */
async function collectClusterHealths(): Promise<void> {
  const clusters = memoryStore.getClusters()
  await Promise.all(
    clusters.map(async (c) => {
      try {
        const d = await clusterDetail(c)
        const score = d.cluster.healthScore
        pushHealth({
          assetId: c.id,
          kind: 'cluster',
          checkedAt: new Date().toISOString(),
          status: d.cluster.status,
          score,
        })
      } catch {
        // 单集群失败不影响整体
      }
    })
  )
}

/** 启动周期采集（首次立即执行一次），返回定时器句柄。 */
export function start(): ReturnType<typeof setInterval> {
  void collectAll()
  void collectDbHealths()
  void collectClusterHealths()
  timers = [
    setInterval(() => {
      void collectAll()
    }, INTERVAL_MS),
    // DB 健康每 2 分钟、集群健康每 5 分钟独立采集
    setInterval(() => {
      void collectDbHealths()
    }, 120000),
    setInterval(() => {
      void collectClusterHealths()
    }, 300000),
  ]
  return timers[0]
}

export function stop(): void {
  timers.forEach(clearInterval)
  timers = []
}

export const metricCollector = { start, stop, collectAsset }
