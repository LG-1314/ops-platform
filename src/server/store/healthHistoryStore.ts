import type { Status } from '@shared/types'
import { readJSONFile, writeJSONAtomic } from './persist'

// DB/K8s 健康时序存储：独立于主机指标（metrics.json），物理隔离
// 环形缓冲 1440 点 + health.json 持久化
const FILE = 'health.json'
const MAX_POINTS = 1440

export interface HealthPoint {
  assetId: string
  kind: 'db' | 'cluster'
  checkedAt: string
  status: Status
  score: number
}

const series = new Map<string, HealthPoint[]>()

let timer: ReturnType<typeof setTimeout> | null = null

function scheduleSave(): void {
  if (timer) return
  timer = setTimeout(() => {
    timer = null
    writeJSONAtomic(FILE, Object.fromEntries(series))
  }, 400)
}

export function loadHealthSeries(): void {
  const raw = readJSONFile(FILE)
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (Array.isArray(v)) series.set(k, v as HealthPoint[])
    }
  }
}

export function pushHealth(p: HealthPoint): void {
  const key = `${p.kind}:${p.assetId}`
  const arr = series.get(key) || []
  arr.push(p)
  if (arr.length > MAX_POINTS) arr.splice(0, arr.length - MAX_POINTS)
  series.set(key, arr)
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
  writeJSONAtomic(FILE, Object.fromEntries(series))
}

export const healthStore = { loadHealthSeries, pushHealth, queryHealth, flushHealth }