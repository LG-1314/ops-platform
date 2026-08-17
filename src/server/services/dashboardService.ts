import { memoryStore } from '../store/memoryStore'
import { assetService } from './assetService'
import { alertService } from './alertService'
import type { DashboardSummary, Status, AssetHealthRow } from '@shared/types'

function isToday(iso?: string): boolean {
  if (!iso) return false
  const d = new Date(iso)
  const n = new Date()
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  )
}

export const dashboardService = {
  /** 聚合资产 / 告警 / 巡检，输出态势总览 */
  summarize(): DashboardSummary {
    const assets = assetService.list()
    const alerts = alertService.list()
    const patrols = memoryStore.getPatrols()

    const healthDistribution: Record<Status, number> = {
      ok: 0,
      warn: 0,
      error: 0,
      unknown: 0,
    }
    for (const a of assets) {
      healthDistribution[a.status] = (healthDistribution[a.status] ?? 0) + 1
    }

    // 活跃告警 = active + ack
    const activeAlerts = alerts.filter(
      (x) => x.state === 'active' || x.state === 'ack'
    ).length

    // 今日巡检 = 当天有运行记录的任务数
    const patrolsToday = patrols.filter((p) => isToday(p.lastRunAt)).length

    const assetRows: AssetHealthRow[] = assets.map((a) => ({
      id: a.id,
      name: a.name,
      status: a.status,
      healthScore: a.healthScore,
    }))

    const recentAlerts = [...alerts]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5)

    return {
      totalAssets: assets.length,
      healthDistribution,
      activeAlerts,
      patrolsToday,
      assets: assetRows,
      recentAlerts,
    }
  },
}
