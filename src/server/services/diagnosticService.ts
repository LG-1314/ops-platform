import { diagnose } from '@diagnostics/engine.ts'
import type { DiagnoseResult } from '@shared/types'

// 诊断历史（进程内，环形缓冲最多 100 条，避免内存泄漏）
const historyStore: DiagnoseResult[] = []
const MAX_HISTORY = 100

export const diagnosticService = {
  /** 调用 engine.diagnose()（只读），可选地按资产记录历史，返回结构化结果 */
  run(assetId?: string): DiagnoseResult {
    const result = diagnose()
    if (assetId) {
      historyStore.push({
        ...result,
        host: `${result.host} (asset:${assetId})`,
      })
    } else {
      historyStore.push(result)
    }
    // 环形缓冲：超出上限时移除最早记录
    if (historyStore.length > MAX_HISTORY) historyStore.splice(0, historyStore.length - MAX_HISTORY)
    return result
  },

  history(assetId?: string): DiagnoseResult[] {
    if (!assetId) return historyStore
    return historyStore.filter((h) => h.host.includes(assetId))
  },
}
