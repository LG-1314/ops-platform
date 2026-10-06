import type { HostMetricSample } from '@shared/types'
import { readJSONFile, writeJSONAtomic } from './persist'

// 轻量时序存储：Map<assetId, HostMetricSample[]> 环形缓冲 + 独立 metrics.json 持久化。
// 与主存储 store.json 物理隔离，避免高频监控数据膨胀主文件。单机桌面定位，不引数据库。
const FILE = 'metrics.json'
const MAX_POINTS = 1440 // 24h @ 60s
const DOWN_SAMPLE_TARGET = 200 // 单请求返回上限，超出按步长降采样
const MAX_KEYS = 2000 // 资产反复增删也不得让文件键数无限增长
const RETENTION_MS = 7 * 24 * 3600 * 1000 // 最新样本早于此的键直接丢弃

const series = new Map<string, HostMetricSample[]>()

// 是否已从磁盘加载：加载前的 flush 一律 no-op。
// 否则启动早期（Map 还空着）的任何 flush 都会把历史文件覆盖成 {}。
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

/** 启动时加载历史时序（不存在则空）。加载时做形状校验 + 裁剪 + 失效键清理。 */
export function loadSeries(): void {
  const raw = readJSONFile(FILE)
  if (raw && typeof raw === 'object') {
    const now = Date.now()
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!Array.isArray(v) || v.length === 0) continue
      const arr = (v as HostMetricSample[]).filter(
        (s) => s && typeof s === 'object' && typeof s.collectedAt === 'string'
      )
      if (arr.length === 0) continue
      if (arr.length > MAX_POINTS) arr.splice(0, arr.length - MAX_POINTS)
      const newest = Date.parse(arr[arr.length - 1].collectedAt)
      if (Number.isFinite(newest) && now - newest > RETENTION_MS) continue // 过期键不再复活
      series.set(k, arr)
    }
  }
  loaded = true
}

/** 删除资产时同步清理其时序，避免已删除资产的曲线永久留在 metrics.json。 */
export function dropSeries(assetId: string): void {
  if (series.delete(assetId)) scheduleSave()
}

/** 追加一条样本并裁剪至环形上限。 */
export function push(sample: HostMetricSample): void {
  const arr = series.get(sample.assetId) || []
  arr.push(sample)
  if (arr.length > MAX_POINTS) arr.splice(0, arr.length - MAX_POINTS)
  series.set(sample.assetId, arr)
  // 键数硬上限：超限时淘汰"最新样本最旧"的键（近似 LRU，防极端增长）
  if (series.size > MAX_KEYS) {
    let oldestKey = ''
    let oldestT = Number.POSITIVE_INFINITY
    for (const [k, v] of series) {
      const t = Date.parse(v[v.length - 1]?.collectedAt || '')
      if (t < oldestT) {
        oldestT = t
        oldestKey = k
      }
    }
    if (oldestKey && oldestKey !== sample.assetId) series.delete(oldestKey)
  }
  scheduleSave()
}

/** 某资产最新一条样本。 */
export function getLatest(assetId: string): HostMetricSample | undefined {
  const arr = series.get(assetId)
  return arr && arr.length ? arr[arr.length - 1] : undefined
}

/** 按 ISO 时间范围查询（含端点），>200 点步长降采样。 */
export function query(assetId: string, from?: string, to?: string): HostMetricSample[] {
  const arr = series.get(assetId) || []
  const fromT = from ? Date.parse(from) : Number.NEGATIVE_INFINITY
  const toT = to ? Date.parse(to) : Number.POSITIVE_INFINITY
  let out = arr.filter((s) => {
    const t = Date.parse(s.collectedAt)
    return t >= fromT && t <= toT
  })
  if (out.length > DOWN_SAMPLE_TARGET) {
    const step = Math.ceil(out.length / DOWN_SAMPLE_TARGET)
    out = out.filter((_, i) => i % step === 0)
  }
  return out
}

/** 所有已有历史数据的资产 id。 */
export function allAssetIds(): string[] {
  return [...series.keys()]
}

/** 进程退出前强制落盘（不丢最后一段防抖窗口内的数据）。 */
export function flushSeries(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  // 未加载（启动早期）或从未写入过时，磁盘文件已是最新，绝不能用空 Map 覆盖它
  if (!loaded || !dirty) return
  writeJSONAtomic(FILE, Object.fromEntries(series))
}

export const metricSeriesStore = {
  loadSeries,
  push,
  getLatest,
  query,
  allAssetIds,
  dropSeries,
  flushSeries,
}
