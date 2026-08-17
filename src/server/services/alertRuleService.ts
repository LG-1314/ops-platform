import { memoryStore } from '../store/memoryStore'
import { getLatest } from './hostMetricsCache'
import type { AlertRule, AlertLevel, Alert, Asset } from '@shared/types'

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

/** 取规则对应指标数值；取不到（如未采集过 SSH 指标）返回 null（跳过该资产）。 */
function metricValue(rule: AlertRule, asset: Asset): { value: number; label: string } | null {
  switch (rule.metric) {
    case 'reachable':
      return { value: asset.reachable ? 1 : 0, label: asset.reachable ? '在线' : '离线' }
    case 'latency':
      return { value: asset.latencyMs ?? 0, label: `${asset.latencyMs ?? 0}ms` }
    case 'healthScore':
      return { value: asset.healthScore, label: String(asset.healthScore) }
    case 'cpu': {
      const m = getLatest(asset.id)
      if (!m || m.cpuIdle == null) return null
      const v = Math.max(0, Math.round(100 - m.cpuIdle))
      return { value: v, label: `${v}%` }
    }
    case 'mem': {
      const m = getLatest(asset.id)
      if (!m || m.memUsedMb == null || !m.memTotalMb) return null
      const v = Math.round((m.memUsedMb / m.memTotalMb) * 100)
      return { value: v, label: `${v}%` }
    }
    case 'disk': {
      const m = getLatest(asset.id)
      if (!m || m.disk.length === 0) return null
      const v = Math.max(...m.disk.map((d) => d.usedPct))
      return { value: v, label: `${v}%` }
    }
  }
  return null
}

function cmp(v: number, op: AlertRule['operator'], t: number): boolean {
  switch (op) {
    case '>':
      return v > t
    case '>=':
      return v >= t
    case '<':
      return v < t
    case '<=':
      return v <= t
    case '==':
      return v === t
    case '!=':
      return v !== t
  }
  return false
}

function targets(rule: AlertRule): Asset[] {
  const all = memoryStore.getAssets()
  if (rule.scope === 'asset') return all.filter((a) => a.id === rule.assetId)
  return all
}

export const alertRuleService = {
  list(): AlertRule[] {
    return memoryStore.getAlertRules()
  },
  get(id: string): AlertRule | undefined {
    return memoryStore.getAlertRules().find((r) => r.id === id)
  },
  create(input: Partial<AlertRule>): AlertRule {
    const rule: AlertRule = {
      id: genId('rule'),
      name: input.name || '未命名规则',
      enabled: input.enabled ?? true,
      scope: input.scope || 'all',
      assetId: input.assetId,
      metric: (input.metric as AlertRule['metric']) || 'healthScore',
      operator: (input.operator as AlertRule['operator']) || '<',
      threshold: input.threshold ?? 0,
      level: (input.level as AlertLevel) || 'P3',
      message: input.message,
      createdAt: new Date().toISOString(),
    }
    return memoryStore.addAlertRule(rule)
  },
  update(id: string, input: Partial<AlertRule>): AlertRule | undefined {
    return memoryStore.updateAlertRule(id, input)
  },
  remove(id: string): boolean {
    return memoryStore.removeAlertRule(id)
  },

  /** 评估全部启用规则，对命中的资产生成告警（按 rule+asset 去重）。返回新增告警数。 */
  evaluateAll(): number {
    const rules = memoryStore.getAlertRules().filter((r) => r.enabled)
    if (rules.length === 0) return 0
    const active = memoryStore.getAlerts().filter((a) => a.state === 'active')
    let created = 0
    for (const rule of rules) {
      for (const asset of targets(rule)) {
        const mv = metricValue(rule, asset)
        if (!mv) continue
        if (!cmp(mv.value, rule.operator, rule.threshold)) continue
        const title = `${rule.name} · ${asset.name}`
        if (active.some((a) => a.title === title && a.assetId === asset.id)) continue
        const alert: Alert = {
          id: genId('alert'),
          level: rule.level,
          title,
          assetId: asset.id,
          message: rule.message || `指标 ${rule.metric} = ${mv.label} ${rule.operator} ${rule.threshold}`,
          state: 'active',
          createdAt: new Date().toISOString(),
        }
        memoryStore.addAlert(alert)
        created++
      }
    }
    return created
  },
}
