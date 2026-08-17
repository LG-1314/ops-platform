import { diagnose } from '@diagnostics/engine.ts'
import type { DiagnoseResult } from '@shared/types'

// 诊断历史（进程内，仅用于 /diagnostics/history 演示）
const historyStore: DiagnoseResult[] = []

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
    return result
  },

  history(assetId?: string): DiagnoseResult[] {
    if (!assetId) return historyStore
    return historyStore.filter((h) => h.host.includes(assetId))
  },
}
