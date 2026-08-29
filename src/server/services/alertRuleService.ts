import { memoryStore } from '../store/memoryStore'
import { getLatest } from './hostMetricsCache'
import { notificationService } from './notificationService'
import type { AlertRule, AlertLevel, Alert, Asset } from '@shared/types'

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

/**
 * 告警再触发冷却窗口：规则+资产 维度，命中开单后 N 分钟内不重复开单，
 * 防止「告警被 resolved 但指标仍越阈值」时每 30s 评估周期刷出风暴。
 * 指标恢复正常时清除冷却记录，下次越阈值立即重新开单。
 */
const ALERT_COOLDOWN_MS = 10 * 60 * 1000
const firedAt = new Map<string, number>()

/** 清空冷却记录（测试用/手动重置）。 */
export function resetAlertCooldown(): void {
  firedAt.clear()
}

/** 取规则对应指标数值；取不到（如未采集过 SSH 指标）返回 null（跳过该资产）。 */
function metricValue(rule: AlertRule, asset: Asset): { value: number; label: string } | null {
  switch (rule.metric) {
    case 'reachable':
      if (asset.reachable == null) return null
      return { value: asset.reachable ? 1 : 0, label: asset.reachable ? '在线' : '离线' }
    case 'latency':
      if (asset.latencyMs == null) return null
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
    case 'netRx': {
      const m = getLatest(asset.id)
      if (m?.network?.rxRateKbps == null) return null
      const v = Math.round(m.network.rxRateKbps * 100) / 100
      return { value: v, label: `${v} KB/s` }
    }
    case 'netTx': {
      const m = getLatest(asset.id)
      if (m?.network?.txRateKbps == null) return null
      const v = Math.round(m.network.txRateKbps * 100) / 100
      return { value: v, label: `${v} KB/s` }
    }
  }
  return null
}

/** 各指标的单位（资源类告警展示「当前 x% / 阈值 y%」用；reachable 为在线状态非数值，无单位） */
const METRIC_UNIT: Partial<Record<AlertRule['metric'], string>> = {
  latency: 'ms',
  healthScore: '分',
  cpu: '%',
  mem: '%',
  disk: '%',
  netRx: 'KB/s',
  netTx: 'KB/s',
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

  /**
   * 评估全部启用规则，对命中的资产生成告警。
   * 去重窗口：同一 rule+asset 在「尚未真正恢复」前不重复建单——
   * 即已存在任意非 resolved 状态的同名单（active/ack/silenced 均算"仍在处理中"），不再新建，
   * 避免确认/静默后每轮评估又刷出重复告警形成风暴。
   * 仅当该单被 resolved（或不存在）且本次仍命中阈值时，才重新开单。
   */
  evaluateAll(): number {
    const rules = memoryStore.getAlertRules().filter((r) => r.enabled)
    if (rules.length === 0) return 0
    // 仍在处理中的告警（非 resolved）按 title+assetId 建索引，用于去重
    const openByKey = new Map<string, boolean>()
    for (const a of memoryStore.getAlerts()) {
      if (a.state === 'resolved') continue
      openByKey.set(`${a.title}@@${a.assetId}`, true)
    }
    const now = Date.now()
    let created = 0
    for (const rule of rules) {
      for (const asset of targets(rule)) {
        const mv = metricValue(rule, asset)
        if (!mv) continue
        const firing = cmp(mv.value, rule.operator, rule.threshold)
        const key = `${rule.id}:${asset.id}`
        if (!firing) {
          // 指标已恢复正常：清除冷却记录，允许下次越阈值立即开单
          firedAt.delete(key)
          continue
        }
        const lastFired = firedAt.get(key) || 0
        if (now - lastFired < ALERT_COOLDOWN_MS) continue
        const title = `${rule.name} · ${asset.name}`
        const openKey = `${title}@@${asset.id}`
        if (openByKey.has(openKey)) continue
        const alert: Alert = {
          id: genId('alert'),
          level: rule.level,
          title,
          assetId: asset.id,
          message: rule.message || `指标 ${rule.metric} = ${mv.label} ${rule.operator} ${rule.threshold}`,
          currentValue: mv.value,
          threshold: rule.threshold,
          unit: METRIC_UNIT[rule.metric],
          state: 'active',
          createdAt: new Date().toISOString(),
        }
        memoryStore.addAlert(alert)
        openByKey.set(openKey, true)
        firedAt.set(key, now)
        created++
        // 生成告警后向各通知渠道推送（失败不影响告警落库）
        void notificationService.notify(alert).catch(() => {})
      }
    }
    return created
  },
}
