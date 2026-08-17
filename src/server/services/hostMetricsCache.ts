import type { HostMetricSample } from '@shared/types'

// SSH 采集到的最新主机指标缓存（进程内，运行时态）。
// 告警引擎读取它来对 cpu/mem/disk 指标做规则评估；重启后由下次 SSH 采集重建。
const cache = new Map<string, HostMetricSample>()

export function setLatest(sample: HostMetricSample): void {
  cache.set(sample.assetId, sample)
}

export function getLatest(assetId: string): HostMetricSample | undefined {
  return cache.get(assetId)
}

export function getAll(): HostMetricSample[] {
  return [...cache.values()]
}
