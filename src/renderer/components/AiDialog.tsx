import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Button,
  CircularProgress,
  Chip,
  Divider,
  IconButton,
  Tooltip,
  Stack,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import {
  SmartToy as IconAi,
  Close as IconClose,
  OpenInNew as IconOpenInNew,
  ContentCopy as IconCopy,
  Check as IconCheck,
} from '@mui/icons-material'
import { api } from '../../capabilities/bus'
import { useNavigate } from 'react-router-dom'
import Markdown from './Markdown'

export interface AiContextPayload {
  kind: string
  payload: Record<string, unknown>
}

interface Props {
  open: boolean
  title: string
  context?: AiContextPayload | null
  onClose: () => void
}

/**
 * 页内 AI 智能分析弹窗：携带平台真实上下文（告警 / 主机指标 / 巡检结果）调用大模型，
 * 在当前页展示分析结论，看完即关，不打断运维操作流。
 */
export default function AiDialog({ open, title, context, onClose }: Props) {
  const theme = useTheme()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [reply, setReply] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const copyReply = async () => {
    try {
      await navigator.clipboard.writeText(reply)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* 忽略复制失败 */
    }
  }

  useEffect(() => {
    if (!open || !context) return
    setLoading(true)
    setReply('')
    setError('')
    api.ai
      .chat([], { kind: context.kind, payload: context.payload })
      .then((r) => setReply(r.reply))
      .catch((e) => setError((e as Error).message || 'AI 分析失败'))
      .finally(() => setLoading(false))
  }, [open, context])

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <IconAi sx={{ color: theme.palette.primary.main }} />
        <Typography variant="h6" sx={{ fontWeight: 700, flexGrow: 1 }} noWrap>
          {title}
        </Typography>
        <Chip size="small" label="AI 分析" color="primary" variant="outlined" />
        <Button
          size="small"
          color="primary"
          onClick={() => navigate('/ai-assistant')}
          startIcon={<IconOpenInNew />}
          sx={{ ml: 1 }}
        >
          在 AI 助手展开
        </Button>
        <Button size="small" color="inherit" onClick={onClose} startIcon={<IconClose />}>
          关闭
        </Button>
      </DialogTitle>
      <Divider />
      <DialogContent>
        {loading ? (
          <Box display="flex" flexDirection="column" alignItems="center" gap={1.5} py={6}>
            <CircularProgress size={28} />
            <Typography variant="body2" color="text.secondary">AI 正在结合平台数据深度分析…</Typography>
          </Box>
        ) : error ? (
          <Box py={3}>
            <Typography variant="body2" color="error" sx={{ mb: 1 }}>{error}</Typography>
            <Typography variant="caption" color="text.secondary">
              可在「设置 → AI 大模型」检查配置，或前往「AI 智能助手」手动提问。
            </Typography>
          </Box>
        ) : (
          <Box>
            <Stack direction="row" justifyContent="flex-end" sx={{ mb: 0.5 }}>
              <Tooltip title="复制分析结果">
                <IconButton size="small" onClick={copyReply}>
                  {copied ? (
                    <IconCheck fontSize="small" sx={{ color: theme.palette.success.main }} />
                  ) : (
                    <IconCopy fontSize="small" sx={{ opacity: 0.6 }} />
                  )}
                </IconButton>
              </Tooltip>
            </Stack>
            <Markdown text={reply} />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>关闭</Button>
      </DialogActions>
    </Dialog>
  )
}
