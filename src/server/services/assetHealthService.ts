import { memoryStore } from '../store/memoryStore'
import type { Asset, HostMetricSample, Status } from '@shared/types'

function pctStatus(pct?: number): Status {
  if (pct == null || !Number.isFinite(pct)) return 'unknown'
  if (pct >= 90) return 'error'
  if (pct >= 75) return 'warn'
  return 'ok'
}

function worstStatus(statuses: Status[]): Status {
  if (statuses.includes('error')) return 'error'
  if (statuses.includes('warn')) return 'warn'
  if (statuses.includes('ok')) return 'ok'
  return 'unknown'
}

function scoreFromSample(sample: HostMetricSample): number {
  const cpuPct = sample.cpuIdle == null ? undefined : Math.max(0, Math.round(100 - sample.cpuIdle))
  const memPct = sample.memTotalMb && sample.memUsedMb != null
    ? Math.round((sample.memUsedMb / sample.memTotalMb) * 100)
    : undefined
  const diskPct = sample.disk.length > 0 ? Math.max(...sample.disk.map((d) => d.usedPct)) : undefined
  const pcts = [cpuPct, memPct, diskPct].filter((v): v is number => v != null && Number.isFinite(v))
  if (pcts.length === 0) return sample.status === 'ok' ? 80 : 60
  const maxPct = Math.max(...pcts)
  return Math.max(0, Math.min(100, 100 - Math.max(0, maxPct - 60)))
}

export function markAssetCollectionSuccess(
  assetId: string,
  sample: HostMetricSample,
  checkedAt = sample.collectedAt || new Date().toISOString()
): Asset | undefined {
  const cpuPct = sample.cpuIdle == null ? undefined : Math.max(0, Math.round(100 - sample.cpuIdle))
  const memPct = sample.memTotalMb && sample.memUsedMb != null
    ? Math.round((sample.memUsedMb / sample.memTotalMb) * 100)
    : undefined
  const diskPct = sample.disk.length > 0 ? Math.max(...sample.disk.map((d) => d.usedPct)) : undefined
  const metricStatus = worstStatus([sample.status, pctStatus(cpuPct), pctStatus(memPct), pctStatus(diskPct)])
  return memoryStore.updateAsset(assetId, {
    reachable: true,
    status: metricStatus,
    healthScore: scoreFromSample(sample),
    statusReason: undefined,
    lastCheckAt: checkedAt,
    lastScanAt: checkedAt,
  })
}

export function markAssetConnectionFailure(
  assetId: string,
  reason = '连接失败或采集中断',
  checkedAt = new Date().toISOString()
): Asset | undefined {
  return memoryStore.updateAsset(assetId, {
    reachable: false,
    latencyMs: undefined,
    status: 'error',
    healthScore: 0,
    statusReason: reason,
    lastCheckAt: checkedAt,
    lastScanAt: checkedAt,
  })
}
