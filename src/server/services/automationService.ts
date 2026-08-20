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

  patchIncident(id: string, patch: Partial<Incident>): Incident | undefined {
    return memoryStore.updateIncident(id, { ...patch, updatedAt: new Date().toISOString() })
  },

  removeIncident(id: string): boolean {
    return memoryStore.removeIncident(id)
  },

  /** CI/CD 流水线台账（真实可增删改，替代早期硬编码示例数据） */
  cicd(): CicdPipeline[] {
    return memoryStore.getCicdPipelines()
  },

  upsertPipeline(partial: Partial<CicdPipeline>): CicdPipeline {
    const p: CicdPipeline = {
      id: partial.id || genId('pipe'),
      name: partial.name || '未命名流水线',
      status: partial.status || 'pending',
      stage: partial.stage || 'build',
      lastRunAt: partial.lastRunAt,
    }
    return memoryStore.addCicdPipeline(p)
  },

  patchPipeline(id: string, patch: Partial<CicdPipeline>): CicdPipeline | undefined {
    return memoryStore.updateCicdPipeline(id, patch)
  },

  removePipeline(id: string): boolean {
    return memoryStore.removeCicdPipeline(id)
  },
}
