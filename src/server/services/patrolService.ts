import { memoryStore } from '../store/memoryStore'
import { diagnose } from '@diagnostics/engine.ts'
import type { PatrolTask, PatrolRun, PatrolLayer } from '@shared/types'

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}`
}

export const patrolService = {
  list(): PatrolTask[] {
    return memoryStore.getPatrols()
  },

  get(id: string): PatrolTask | undefined {
    return memoryStore.getPatrols().find((p) => p.id === id)
  },

  create(partial: Partial<PatrolTask>): PatrolTask {
    const task: PatrolTask = {
      id: partial.id || genId('patrol'),
      name: partial.name || '未命名巡检',
      layers: (partial.layers as PatrolLayer[]) || ['basic'],
      cron: partial.cron || '0 * * * *',
      enabled: partial.enabled ?? true,
      status: partial.status || 'idle',
      lastRunAt: partial.lastRunAt,
      nextRunAt: partial.nextRunAt,
      history: partial.history || [],
    }
    return memoryStore.addPatrol(task)
  },

  update(id: string, partial: Partial<PatrolTask>): PatrolTask | undefined {
    return memoryStore.updatePatrol(id, partial)
  },

  remove(id: string): boolean {
    return memoryStore.removePatrol(id)
  },

  /** 合成执行：对已纳管资产（此处以本机只读体检代表）跑一次 diagnose，生成一条历史记录 */
  run(id: string): PatrolRun {
    const task = memoryStore.getPatrols().find((p) => p.id === id)
    if (!task) throw new Error('patrol not found')

    const startedAt = new Date().toISOString()
    const result = diagnose()
    const finishedAt = new Date().toISOString()

    const hasError = result.metrics.some((m) => m.status === 'error')
    const anomaly = result.metrics.filter(
      (m) => m.status === 'error' || m.status === 'warn'
    ).length

    const run: PatrolRun = {
      id: genId('run'),
      taskId: id,
      startedAt,
      finishedAt,
      status: hasError ? 'failed' : 'success',
      summary: `巡检「${task.name}」完成，覆盖 ${result.metrics.length} 项指标，其中 ${anomaly} 项异常/警告。`,
    }

    task.history = [...(task.history || []), run]
    task.lastRunAt = finishedAt
    task.status = run.status
    memoryStore.updatePatrol(id, task)

    return run
  },
}
