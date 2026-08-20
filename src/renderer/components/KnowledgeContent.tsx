import { Box, Typography, Chip } from '@mui/material'
import type { ReactNode } from 'react'

// 运维 FAQ 内容渲染器：
// - 把「1) …；2) …」格式的步骤文本渲染为有序列表（可读性远优于纯文本）
// - 反引号内联代码（`cmd`）渲染为高亮 code 片段
// - 可选的搜索关键词高亮（mark 样式）

/** 反引号内联代码 → <code> 高亮；其余文本原样 */
function renderInline(text: string, highlight?: string[]): ReactNode[] {
  const parts = text.split(/(`[^`]+`)/g)
  return parts.map((p, i) => {
    if (p.startsWith('`') && p.endsWith('`') && p.length > 2) {
      return (
        <Box
          component="code"
          key={i}
          sx={{
            fontFamily: 'JetBrains Mono, Consolas, monospace',
            fontSize: 12,
            color: 'primary.light',
            bgcolor: 'action.hover',
            borderRadius: 0.75,
            px: 0.6,
            py: 0.15,
            mx: 0.3,
          }}
        >
          {p.slice(1, -1)}
        </Box>
      )
    }
    return highlight && highlight.length > 0 ? highlightText(p, highlight, i) : <span key={i}>{p}</span>
  })
}

/** 关键词高亮：按出现位置切分，匹配段渲染为 mark */
function highlightText(text: string, keywords: string[], keyBase: number): ReactNode[] {
  const terms = keywords.filter(Boolean).map((k) => k.toLowerCase().trim())
  if (terms.length === 0 || !text) return [<span key={keyBase}>{text}</span>]
  const out: ReactNode[] = []
  let rest = text
  let cursor = 0
  while (rest.length > 0) {
    let earliest = -1
    let earliestTerm = ''
    for (const t of terms) {
      const idx = rest.toLowerCase().indexOf(t)
      if (idx >= 0 && (earliest < 0 || idx < earliest)) {
        earliest = idx
        earliestTerm = t
      }
    }
    if (earliest < 0) {
      out.push(<span key={`${keyBase}-${cursor}`}>{rest}</span>)
      break
    }
    if (earliest > 0) out.push(<span key={`${keyBase}-${cursor}`}>{rest.slice(0, earliest)}</span>)
    const matched = rest.slice(earliest, earliest + earliestTerm.length)
    out.push(
      <Box
        component="mark"
        key={`${keyBase}-${cursor}-m`}
        sx={{ bgcolor: 'primary.main', color: '#fff', borderRadius: 0.5, px: 0.3, py: 0, fontSize: 'inherit' }}
      >
        {matched}
      </Box>
    )
    cursor += 1
    rest = rest.slice(earliest + earliestTerm.length)
  }
  return out
}

/** 把内容切成步骤：按「数字. 」/「数字) 」切分，保留首段说明 */
function splitSteps(text: string): string[] {
  const clean = text.replace(/\r/g, '').trim()
  if (!clean) return []
  // 步骤分隔符：1) / 1. 2、 等（中文分号/句点后紧跟数字亦可）
  const parts = clean.split(/\s*(?:\d+\s*[).、．]|\(\d+\))\s*/).filter(Boolean)
  return parts
}

interface Props {
  content: string
  /** 搜索关键词（高亮命中） */
  highlight?: string[]
  dense?: boolean
}

export default function KnowledgeContent({ content, highlight, dense }: Props) {
  if (!content) return <Typography variant="body2" color="text.secondary">（无内容）</Typography>

  const steps = splitSteps(content)
  // 步骤超过 1 个 → 有序列表；否则按单段渲染（保留换行）
  if (steps.length > 1) {
    return (
      <Box component="ol" sx={{ m: 0, pl: 2, lineHeight: 1.8 }}>
        {steps.map((s, i) => (
          <Box component="li" key={i} sx={{ mb: 0.75, color: 'text.primary', fontSize: dense ? 13 : 14 }}>
            {renderInline(s.trim(), highlight)}
          </Box>
        ))}
      </Box>
    )
  }
  return (
    <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>
      {renderInline(content, highlight)}
    </Typography>
  )
}

/** 关联资产点击进入资产页；传入 onNavigate 或默认跳转 */
export function AssetChips({
  assets,
  onNavigate,
}: {
  assets: string[]
  onNavigate?: (assetId: string) => void
}) {
  if (!assets || assets.length === 0) return null
  return (
    <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
      <Chip size="small" label="关联资产" variant="outlined" sx={{ color: 'text.secondary', mr: 0.5 }} />
      {assets.map((a) => (
        <Chip
          key={a}
          size="small"
          label={a}
          variant="outlined"
          color="primary"
          sx={{ cursor: 'pointer' }}
          onClick={() => onNavigate?.(a)}
        />
      ))}
    </Box>
  )
}