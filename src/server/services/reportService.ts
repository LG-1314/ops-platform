import { diagnosticService } from './diagnosticService'
import { dashboardService } from './dashboardService'
import { patrolService } from './patrolService'
import type { ReportRequest, ReportResult } from '@shared/types'

function escapeMd(s: string): string {
  return s.replace(/\|/g, '\\|')
}

export const reportService = {
  /** 生成 Markdown 报告（PDF 为占位：仍返回 markdown 文本，format 标记 pdf） */
  export(req: ReportRequest): ReportResult {
    const generatedAt = new Date().toISOString()
    const title = req.title || '运维报告'
    let content = `# ${title}\n\n生成时间：${generatedAt}\n\n`

    if (req.type === 'diagnose') {
      const r = diagnosticService.run(req.assetId)
      content += `## 系统体检（${r.platform} / ${r.host}）\n\n`
      content += `| 指标 | 当前值 | 正常范围 | 状态 |\n|---|---|---|---|\n`
      for (const m of r.metrics) {
        content += `| ${escapeMd(m.name)} | ${escapeMd(m.value)} | ${escapeMd(
          m.normal
        )} | ${m.status} |\n`
      }
      content += `\n## 建议\n`
      if (r.suggestions.length === 0) content += `- 暂无\n`
      else for (const s of r.suggestions) content += `- ${escapeMd(s)}\n`
    } else if (req.type === 'dashboard') {
      const d = dashboardService.summarize()
      content += `## 态势总览\n\n`
      content += `- 资产总数：${d.totalAssets}\n`
      content += `- 活跃告警：${d.activeAlerts}\n`
      content += `- 今日巡检：${d.patrolsToday}\n`
      content += `- 健康分布：ok=${d.healthDistribution.ok} warn=${d.healthDistribution.warn} error=${d.healthDistribution.error} unknown=${d.healthDistribution.unknown}\n\n`
      content += `### 资产健康榜\n\n`
      content += `| 资产 | 状态 | 健康分 |\n|---|---|---|\n`
      for (const a of d.assets) {
        content += `| ${escapeMd(a.name)} | ${a.status} | ${a.healthScore} |\n`
      }
    } else if (req.type === 'patrol') {
      const list = patrolService.list()
      content += `## 巡检任务（${list.length}）\n\n`
      for (const p of list) {
        content += `- ${escapeMd(p.name)} [${p.status}] 层级：${p.layers.join(
          ','
        )} 上次运行：${p.lastRunAt || '—'}\n`
      }
    }

    const filename = `${req.type}-report-${generatedAt.replace(/[:.]/g, '-')}.md`
    return { format: req.format, filename, content, generatedAt }
  },
}
