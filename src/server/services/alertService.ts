import { memoryStore } from '../store/memoryStore'
import type { Alert, AlertLevel, AlertState } from '@shared/types'

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}`
}

export const alertService = {
  list(level?: AlertLevel, state?: AlertState, assetId?: string): Alert[] {
    let list = memoryStore.getAlerts()
    if (level) list = list.filter((a) => a.level === level)
    if (state) list = list.filter((a) => a.state === state)
    if (assetId) list = list.filter((a) => a.assetId === assetId)
    return list
  },

  get(id: string): Alert | undefined {
    return memoryStore.getAlerts().find((a) => a.id === id)
  },

  create(partial: Partial<Alert>): Alert {
    const now = new Date().toISOString()
    const alert: Alert = {
      id: partial.id || genId('alert'),
      level: (partial.level as AlertLevel) || 'P3',
      title: partial.title || '未命名告警',
      assetId: partial.assetId,
      message: partial.message || '',
      state: (partial.state as AlertState) || 'active',
      createdAt: now,
      ackedBy: partial.ackedBy,
    }
    return memoryStore.addAlert(alert)
  },

  /** 状态流转：active -> ack/silenced/resolved；写入 updatedAt，resolved 时记 resolvedAt */
  patch(id: string, patch: { state: AlertState; ackedBy?: string }): Alert | undefined {
    const now = new Date().toISOString()
    const p: Partial<Alert> = { ...patch, updatedAt: now }
    if (patch.state === 'resolved') p.resolvedAt = now
    if (patch.state !== 'resolved') p.resolvedAt = undefined // 重新激活/确认后清除旧解决时间
    return memoryStore.updateAlert(id, p)
  },

  remove(id: string): boolean {
    return memoryStore.removeAlert(id)
  },
}
