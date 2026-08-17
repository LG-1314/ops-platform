import { memoryStore } from '../store/memoryStore'
import type { Incident, CicdPipeline, IncidentState } from '@shared/types'

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}`
}

export const automationService = {
  incidents(): Incident[] {
    return memoryStore.getIncidents()
  },

  createIncident(partial: Partial<Incident>): Incident {
    const now = new Date().toISOString()
    const inc: Incident = {
      id: partial.id || genId('inc'),
      title: partial.title || '未命名事故',
      state: (partial.state as IncidentState) || 'open',
      level: partial.level || 'P2',
      assetId: partial.assetId,
      assignee: partial.assignee,
      createdAt: now,
      updatedAt: now,
      relatedKnowledge: partial.relatedKnowledge || [],
    }
    return memoryStore.addIncident(inc)
  },

  patchIncident(id: string, patch: { state: IncidentState }): Incident | undefined {
    return memoryStore.updateIncident(id, { ...patch, updatedAt: new Date().toISOString() })
  },

  /** CI/CD 视图（占位：返回示例流水线） */
  cicd(): CicdPipeline[] {
    const now = new Date().toISOString()
    return [
      { id: 'pipe-1', name: '前端构建', status: 'success', lastRunAt: now, stage: 'build' },
      { id: 'pipe-2', name: '后端发布', status: 'running', stage: 'deploy' },
      { id: 'pipe-3', name: '端到端测试', status: 'pending', stage: 'test' },
    ]
  },
}
