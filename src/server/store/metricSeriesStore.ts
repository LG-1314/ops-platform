import type { HostMetricSample } from '@shared/types'
import { readJSONFile, writeJSONAtomic } from './persist'

// 轻量时序存储：Map<assetId, HostMetricSample[]> 环形缓冲 + 独立 metrics.json 持久化。
// 与主存储 store.json 物理隔离，避免高频监控数据膨胀主文件。单机桌面定位，不引数据库。
const FILE = 'metrics.json'
const MAX_POINTS = 1440 // 24h @ 60s
const DOWN_SAMPLE_TARGET = 200 // 单请求返回上限，超出按步长降采样

const series = new Map<string, HostMetricSample[]>()

let timer: ReturnType<typeof setTimeout> | null = null

function scheduleSave(): void {
  if (timer) return
  timer = setTimeout(() => {
    timer = null
    writeJSONAtomic(FILE, Object.fromEntries(series))
  }, 400)
}

/** 启动时加载历史时序（不存在则空）。 */
export function loadSeries(): void {
  const raw = readJSONFile(FILE)
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (Array.isArray(v)) series.set(k, v as HostMetricSample[])
    }
  }
}

/** 追加一条样本并裁剪至环形上限。 */
export function push(sample: HostMetricSample): void {
  const arr = series.get(sample.assetId) || []
  arr.push(sample)
  if (arr.length > MAX_POINTS) arr.splice(0, arr.length - MAX_POINTS)
  series.set(sample.assetId, arr)
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
  writeJSONAtomic(FILE, Object.fromEntries(series))
}

export const metricSeriesStore = { loadSeries, push, getLatest, query, allAssetIds, flushSeries }
