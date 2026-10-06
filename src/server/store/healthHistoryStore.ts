import type { Status } from '@shared/types'
import { readJSONFile, writeJSONAtomic } from './persist'

// DB/K8s 健康时序存储：独立于主机指标（metrics.json），物理隔离
// 环形缓冲 1440 点 + health.json 持久化
const FILE = 'health.json'
const MAX_POINTS = 1440
const MAX_KEYS = 2000
const RETENTION_MS = 7 * 24 * 3600 * 1000

export interface HealthPoint {
  assetId: string
  kind: 'db' | 'cluster'
  checkedAt: string
  status: Status
  score: number
}

const series = new Map<string, HealthPoint[]>()

// 与 metricSeriesStore 相同的加载守卫：加载前 flush 不得用空 Map 覆盖磁盘文件
let loaded = false
let dirty = false

let timer: ReturnType<typeof setTimeout> | null = null

function scheduleSave(): void {
  dirty = true
  if (timer) return
  timer = setTimeout(() => {
    timer = null
    writeJSONAtomic(FILE, Object.fromEntries(series))
  }, 400)
}

export function loadHealthSeries(): void {
  const raw = readJSONFile(FILE)
  if (raw && typeof raw === 'object') {
    const now = Date.now()
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!Array.isArray(v) || v.length === 0) continue
      const arr = (v as HealthPoint[]).filter(
        (p) => p && typeof p === 'object' && typeof p.checkedAt === 'string'
      )
      if (arr.length === 0) continue
      if (arr.length > MAX_POINTS) arr.splice(0, arr.length - MAX_POINTS)
      const newest = Date.parse(arr[arr.length - 1].checkedAt)
      if (Number.isFinite(newest) && now - newest > RETENTION_MS) continue
      series.set(k, arr)
    }
  }
  loaded = true
}

/** 删除 DB 连接/集群时同步清理对应健康时序。 */
export function dropHealth(kind: 'db' | 'cluster', assetId: string): void {
  if (series.delete(`${kind}:${assetId}`)) scheduleSave()
}

export function pushHealth(p: HealthPoint): void {
  const key = `${p.kind}:${p.assetId}`
  const arr = series.get(key) || []
  arr.push(p)
  if (arr.length > MAX_POINTS) arr.splice(0, arr.length - MAX_POINTS)
  series.set(key, arr)
  if (series.size > MAX_KEYS) {
    let oldestKey = ''
    let oldestT = Number.POSITIVE_INFINITY
    for (const [k, v] of series) {
      const t = Date.parse(v[v.length - 1]?.checkedAt || '')
      if (t < oldestT) {
        oldestT = t
        oldestKey = k
      }
    }
    if (oldestKey && oldestKey !== key) series.delete(oldestKey)
  }
  scheduleSave()
}

export function queryHealth(kind: 'db' | 'cluster', assetId: string, from?: string, to?: string): HealthPoint[] {
  const key = `${kind}:${assetId}`
  const arr = series.get(key) || []
  const fromT = from ? Date.parse(from) : Number.NEGATIVE_INFINITY
  const toT = to ? Date.parse(to) : Number.POSITIVE_INFINITY
  let out = arr.filter((s) => {
    const t = Date.parse(s.checkedAt)
    return t >= fromT && t <= toT
  })
  const DOWN_SAMPLE_TARGET = 200
  if (out.length > DOWN_SAMPLE_TARGET) {
    const step = Math.ceil(out.length / DOWN_SAMPLE_TARGET)
    out = out.filter((_, i) => i % step === 0)
  }
  return out
}

export function flushHealth(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  if (!loaded || !dirty) return
  writeJSONAtomic(FILE, Object.fromEntries(series))
}

export const healthStore = { loadHealthSeries, pushHealth, queryHealth, dropHealth, flushHealth }
