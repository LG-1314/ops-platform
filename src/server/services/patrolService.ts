import { memoryStore } from '../store/memoryStore'
import { diagnose } from '@diagnostics/engine.ts'
import type { PatrolTask, PatrolRun, PatrolLayer } from '@shared/types'

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}`
}

type CronRange = { min: number; max: number }

const CRON_RANGES: CronRange[] = [
  { min: 0, max: 59 },
  { min: 0, max: 23 },
  { min: 1, max: 31 },
  { min: 1, max: 12 },
  { min: 0, max: 7 },
]

function fieldMatches(field: string, value: number, range: CronRange): boolean {
  if (!field || value < range.min || value > range.max) return false
  return field.split(',').some((part) => {
    const [base, stepText] = part.split('/')
    const step = stepText === undefined ? 1 : Number(stepText)
    if (!Number.isInteger(step) || step < 1) return false
    let start = range.min
    let end = range.max
    if (base !== '*') {
      if (base.includes('-')) {
        const [a, b] = base.split('-').map(Number)
        if (!Number.isInteger(a) || !Number.isInteger(b)) return false
        start = a
        end = b
      } else {
        start = Number(base)
        end = start
      }
    }
    if (start < range.min || end > range.max || start > end) return false
    return value >= start && value <= end && (value - start) % step === 0
  })
}

/** 判断本地时间是否匹配 5 段 Cron（分 时 日 月 周），非法表达式安全返回 false。 */
export function matchesCron(expression: string, date = new Date()): boolean {
  const fields = expression.trim().split(/\s+/)
  if (fields.length !== 5) return false
  if (!fieldMatches(fields[0], date.getMinutes(), CRON_RANGES[0])) return false
  if (!fieldMatches(fields[1], date.getHours(), CRON_RANGES[1])) return false
  if (!fieldMatches(fields[3], date.getMonth() + 1, CRON_RANGES[3])) return false

  const dom = fieldMatches(fields[2], date.getDate(), CRON_RANGES[2])
  const weekday = date.getDay()
  // Cron 同时限制日和星期时使用 OR 语义；星期日同时接受 0 和 7。
  const dow = fieldMatches(fields[4], weekday, CRON_RANGES[4]) || (weekday === 0 && fieldMatches(fields[4], 7, CRON_RANGES[4]))
  const domWildcard = fields[2] === '*'
  const dowWildcard = fields[4] === '*'
  if (domWildcard && dowWildcard) return true
  if (domWildcard) return dow
  if (dowWildcard) return dom
  return dom || dow
}

function sameMinute(a: string | undefined, b: Date): boolean {
  if (!a) return false
  const d = new Date(a)
  return !Number.isNaN(d.getTime()) && d.getFullYear() === b.getFullYear() && d.getMonth() === b.getMonth() && d.getDate() === b.getDate() && d.getHours() === b.getHours() && d.getMinutes() === b.getMinutes()
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

  /** 执行当前分钟到期的巡检任务；同一分钟内幂等，避免 30s 定时器重复触发。 */
  runScheduled(now = new Date()): number {
    let executed = 0
    for (const task of memoryStore.getPatrols()) {
      if (!task.enabled || !matchesCron(task.cron, now) || sameMinute(task.lastRunAt, now)) continue
      try {
        this.run(task.id)
        // 以调度检查时间作为幂等标记，避免任务执行跨分钟导致下一轮重复触发。
        memoryStore.updatePatrol(task.id, { lastRunAt: now.toISOString() })
        executed += 1
      } catch {
        memoryStore.updatePatrol(task.id, { status: 'failed', lastRunAt: now.toISOString() })
      }
    }
    return executed
  },
}
