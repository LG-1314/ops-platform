import { Box, Paper, Typography, useTheme } from '@mui/material'
import type { ReactNode } from 'react'

/**
 * 轻量 Markdown 渲染（零依赖）：
 * 支持 ``` 围栏代码块、行内 code、标题、无序/有序列表、加粗、分割线、表格。
 * 不解析 HTML（React 默认转义，防注入），其余内容按纯文本展示。
 */

interface Block {
  type: 'code' | 'table' | 'text'
  lang?: string
  code?: string
  rows?: string[][]
  lines?: string[]
}

/** 把 markdown 文本切成块：代码块 / 表格 / 普通行组 */
function splitBlocks(text: string): Block[] {
  const blocks: Block[] = []
  const lines = text.split('\n')
  let i = 0
  let pending: string[] = []

  const flushText = () => {
    if (pending.length) {
      blocks.push({ type: 'text', lines: pending })
      pending = []
    }
  }

  while (i < lines.length) {
    const line = lines[i]
    // 围栏代码块
    const fence = /^```(\w*)\s*$/.exec(line.trim())
    if (fence) {
      flushText()
      const lang = fence[1]
      const code: string[] = []
      i += 1
      while (i < lines.length && !/^```\s*$/.test(lines[i].trim())) {
        code.push(lines[i])
        i += 1
      }
      i += 1 // 跳过结束围栏
      blocks.push({ type: 'code', lang, code: code.join('\n') })
      continue
    }
    // 表格：当前行与下一行都是管道分隔且第二行为分隔行
    if (line.trim().startsWith('|') && lines[i + 1] && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      flushText()
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i]
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim())
        rows.push(cells)
        i += 1
      }
      if (rows.length >= 2) blocks.push({ type: 'table', rows: rows.slice(1) })
      continue
    }
    pending.push(line)
    i += 1
  }
  flushText()
  return blocks
}

/** 渲染单行文本中的行内样式（code / 加粗） */
function renderInline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  // 先切行内代码（`...`）
  const parts = text.split(/(`[^`]+`)/g)
  parts.forEach((p, idx) => {
    if (!p) return
    if (p.startsWith('`') && p.endsWith('`') && p.length > 1) {
      out.push(
        <Typography
          component="code"
          key={`${keyBase}-c${idx}`}
          sx={{ fontFamily: 'var(--font-mono)', bgcolor: 'action.hover', px: 0.5, borderRadius: 0.5, fontSize: 13 }}
        >
          {p.slice(1, -1)}
        </Typography>,
      )
      return
    }
    // 加粗 **x**
    const boldParts = p.split(/(\*\*[^*]+\*\*)/g)
    boldParts.forEach((b, j) => {
      if (!b) return
      if (b.startsWith('**') && b.endsWith('**') && b.length > 4) {
        out.push(
          <Box component="strong" key={`${keyBase}-b${idx}-${j}`} sx={{ fontWeight: 700 }}>
            {b.slice(2, -2)}
          </Box>,
        )
      } else {
        out.push(<span key={`${keyBase}-t${idx}-${j}`}>{b}</span>)
      }
    })
  })
  return out
}

function renderTextBlock(block: Block, _themeMode: string): ReactNode {
  const lines = block.lines || []
  const isList = lines.some((l) => /^\s*[-*•]\s+/.test(l) || /^\s*\d+\.\s+/.test(l))
  // 纯列表：逐行渲染
  if (isList && lines.every((l) => !l.trim() || /^\s*[-*•]\s+/.test(l) || /^\s*\d+\.\s+/.test(l))) {
    return (
      <Box component="ul" sx={{ m: 0.5, pl: 2.5 }}>
        {lines.filter((l) => l.trim()).map((l, i) => {
          const m = /^\s*([-*•]|\d+\.)\s+(.*)$/.exec(l)
          return (
            <Typography component="li" key={i} variant="body2" sx={{ mb: 0.25, lineHeight: 1.6 }}>
              {m ? renderInline(m[2], `li${i}`) : l}
            </Typography>
          )
        })}
      </Box>
    )
  }
  return lines.map((l, i) => {
    // 标题
    const h = /^(#{1,4})\s+(.*)$/.exec(l.trim())
    if (h) {
      return (
        <Typography
          key={i}
          variant={h[1].length === 1 ? 'subtitle1' : h[1].length === 2 ? 'subtitle2' : 'body2'}
          sx={{ fontWeight: 700, mt: 1, mb: 0.5 }}
        >
          {renderInline(h[2], `h${i}`)}
        </Typography>
      )
    }
    // 分割线
    if (/^\s*[-*_]{3,}\s*$/.test(l)) {
      return <Box key={i} sx={{ my: 1, height: 1, bgcolor: 'divider' }} />
    }
    return (
      <Typography key={i} variant="body2" component="div" sx={{ lineHeight: 1.6, minHeight: '1.6em' }}>
        {renderInline(l, `p${i}`)}
      </Typography>
    )
  })
}

/** 渲染代码块（深色底 + 等宽字体 + 语言标签） */
function renderCodeBlock(block: Block, themeMode: string): ReactNode {
  return (
    <Paper
      variant="outlined"
      sx={{
        my: 1,
        overflow: 'hidden',
        borderRadius: 1.5,
        bgcolor: themeMode === 'dark' ? '#0B0E14' : '#F3F5F9',
        borderColor: 'divider',
      }}
    >
      {block.lang && (
        <Box sx={{ px: 1.5, py: 0.5, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
          <Typography variant="caption" sx={{ fontFamily: 'var(--font-mono)', color: 'text.secondary' }}>
            {block.lang}
          </Typography>
        </Box>
      )}
      <Box
        component="pre"
        sx={{
          m: 0,
          p: 1.5,
          overflow: 'auto',
          fontFamily: 'var(--font-mono)',
          fontSize: 12.5,
          lineHeight: 1.55,
          color: 'text.primary',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {block.code}
      </Box>
    </Paper>
  )
}

/** 渲染表格 */
function renderTable(block: Block, _themeMode: string): ReactNode {
  const rows = block.rows || []
  if (!rows.length) return null
  const head = rows[0]
  const body = rows.slice(1)
  return (
    <Paper variant="outlined" sx={{ my: 1, overflow: 'hidden', borderRadius: 1.5, borderColor: 'divider' }}>
      <Box sx={{ overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {head.map((c, i) => (
                <th
                  key={i}
                  style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid', fontWeight: 700 }}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri}>
                {row.map((c, ci) => (
                  <td key={ci} style={{ padding: '5px 10px', borderBottom: '1px solid', opacity: 0.92 }}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
    </Paper>
  )
}

/** 主入口：渲染整段 Markdown 文本 */
export default function Markdown({ text }: { text: string }) {
  const theme = useTheme()
  const blocks = splitBlocks(text || '')
  return (
    <Box sx={{ '& > * + *': { mt: 0.5 } }}>
      {blocks.map((b, i) => {
        if (b.type === 'code') return <Box key={i}>{renderCodeBlock(b, theme.palette.mode)}</Box>
        if (b.type === 'table') return <Box key={i}>{renderTable(b, theme.palette.mode)}</Box>
        return <Box key={i}>{renderTextBlock(b, theme.palette.mode)}</Box>
      })}
    </Box>
  )
}
