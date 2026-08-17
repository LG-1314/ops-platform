import type { DoloresResult, DoloresTool, Status } from '@shared/types'

const TOOL_LOGS: Record<DoloresTool, string[]> = {
  health: ['检查进程健康状态…', '心跳正常，无异常。'],
  'memory-sync': ['同步 Memory 快照…', '已完成 3 个节点的记忆同步。'],
  'dir-clean': ['扫描临时目录…', '清理完成，释放 120MB。'],
  log: ['采集最近 200 行日志…', '未发现 ERROR 级异常。'],
  cron: ['检查定时任务…', '5 个任务均按计划执行。'],
}

export const doloresService = {
  /** Dolores 工具箱（占位：返回工具执行日志） */
  run(tool: DoloresTool): DoloresResult {
    return {
      tool,
      status: 'ok' as Status,
      logs: TOOL_LOGS[tool] || ['执行完成。'],
      executedAt: new Date().toISOString(),
    }
  },
}
