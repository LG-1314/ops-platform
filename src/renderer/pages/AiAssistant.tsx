import { useEffect, useRef, useState } from 'react'
import {
  Box,
  Typography,
  Stack,
  TextField,
  Button,
  IconButton,
  Card,
  CardContent,
  Paper,
  CircularProgress,
  Chip,
  Alert as MuiAlert,
  Divider,
  useTheme,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material'
import {
  SmartToy as IconAi,
  Send as IconSend,
  Refresh as IconRefresh,
  Warning as IconWarning,
  Computer as IconHost,
  Notifications as IconAlert,
  Assignment as IconReport,
  Quiz as IconQa,
  AutoAwesome as IconSparkle,
  Psychology as IconBrain,
  ContentCopy as IconCopy,
  DeleteSweep as IconClear,
  Check as IconCheck,
} from '@mui/icons-material'
import { api } from '../../capabilities/bus'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import Markdown from '../components/Markdown'

interface ChatEntry {
  role: 'user' | 'assistant'
  content: string
  loading?: boolean
  /** 打字机进度：内容已显示到的字符数（-1=完整显示） */
  typeLen?: number
}

const SUGGESTIONS = [
  { label: '分析活跃告警', icon: <IconAlert fontSize="small" />, prompt: '请分析当前平台所有活跃告警，评估整体风险并给出处置建议。' },
  { label: '生成巡检报告', icon: <IconReport fontSize="small" />, prompt: '请基于平台数据生成一份完整的运维巡检报告。' },
  { label: '运维知识问答', icon: <IconQa fontSize="small" />, prompt: '我有运维问题需要解答：' },
  { label: '分析主机健康', icon: <IconHost fontSize="small" />, prompt: '请分析当前平台所有主机的健康状态。' },
  { label: '安全命令建议', icon: <IconWarning fontSize="small" />, prompt: '请列举日常运维中需要谨慎执行的高危操作及安全替代方案。' },
  { label: '最佳实践', icon: <IconBrain fontSize="small" />, prompt: '请分享企业运维最佳实践，涵盖监控、告警、巡检、变更管理。' },
]

/** 打字机渐显：把一条消息的内容按字符逐步 reveal */
function useTypewriter(messages: ChatEntry[]): [ChatEntry[], (msgs: ChatEntry[]) => void] {
  const [msgs, setMsgs] = useState<ChatEntry[]>(messages)
  const timers = useRef<ReturnType<typeof setInterval>[]>([])

  useEffect(() => () => { timers.current.forEach(clearInterval); timers.current = [] }, [])

  const update = (next: ChatEntry[]) => {
    setMsgs(next)
    timers.current.forEach(clearInterval)
    timers.current = []
    // 找到最后一个完整回复（typeLen === 0 且非 loading），启动打字机
    const idx = next.findIndex((m) => m.role === 'assistant' && !m.loading && m.typeLen === 0)
    if (idx < 0) return
    const full = next[idx].content
    const timer = setInterval(() => {
      setMsgs((prev) => {
        const cur = prev[idx]
        if (!cur || cur.typeLen == null) return prev
        const nextLen = cur.typeLen + 3
        if (nextLen >= full.length) {
          clearInterval(timer)
          const copy = [...prev]
          copy[idx] = { ...cur, typeLen: -1 }
          return copy
        }
        const copy = [...prev]
        copy[idx] = { ...cur, typeLen: nextLen }
        return copy
      })
    }, 16)
    timers.current.push(timer)
  }

  return [msgs, update]
}

export default function AiAssistant() {
  const theme = useTheme()
  const navigate = useNavigate()
  const [messages, setMessages] = useTypewriter([
    { role: 'assistant', content: '你好！我是「运维全维度管理平台」的 AI 智能运维助手。\n\n我可以帮你：\n✅ 分析告警与故障根因\n✅ 诊断主机健康状态\n✅ 生成巡检报告\n✅ 解答运维知识问题\n✅ 提供安全操作建议\n\n请在下方输入问题或点击推荐话题开始。', typeLen: -1 }
  ])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [config, setConfig] = useState<{ baseUrl: string; model: string; provider: string; temperature: number; enabled: boolean; hasApiKey: boolean } | null>(null)
  const [configLoading, setConfigLoading] = useState(true)
  const [error, setError] = useState('')
  const [copiedId, setCopiedId] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const loadConfig = async () => {
    setConfigLoading(true)
    try {
      setConfig(await api.ai.config())
    } catch {
      setConfig(null)
    } finally {
      setConfigLoading(false)
    }
  }
  useEffect(() => {
    void loadConfig()
  }, [])

  // 自动滚动到底部
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  const ask = async (text: string) => {
    const q = text.trim()
    if (!q || sending) return
    setInput('')
    setError('')
    const userMsg: ChatEntry = { role: 'user', content: q }
    const loadingMsg: ChatEntry = { role: 'assistant', content: '', loading: true, typeLen: -1 }
    setMessages([...messages, userMsg, loadingMsg])
    setSending(true)
    try {
      const res = await api.ai.chat([
        { role: 'system', content: '你是一个专业的企业级运维 AI 助手，回答使用简体中文，step-by-step 可执行，涉高危操作务必提醒审批。' },
        { role: 'user', content: q },
      ])
      setMessages([...messages, userMsg, { role: 'assistant', content: res.reply, typeLen: 0 }])
    } catch (e) {
      setMessages(messages.filter((m) => !m.loading))
      setError((e as Error).message || 'AI 请求失败')
    } finally {
      setSending(false)
    }
  }

  const onSuggestion = (prompt: string) => {
    // 如果是需要用户补充的（如知识问答），先把 prompt 填入输入框
    if (prompt.includes('：')) {
      setInput(prompt)
      inputRef.current?.focus()
      return
    }
    void ask(prompt)
  }

  const copyText = async (content: string, id: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedId(id)
      setTimeout(() => setCopiedId(''), 1500)
    } catch {
      setError('复制失败，请手动选择文本')
    }
  }

  const clearChat = () => {
    setConfirmClear(true)
  }

  const doClearChat = () => {
    setConfirmClear(false)
    setMessages([
      { role: 'assistant', content: '对话已清空。我是 AI 智能运维助手，请开始新的提问。', typeLen: -1 },
    ])
  }

  const configOk = config?.enabled && config?.hasApiKey

  return (
    <Box>
      <PageHeader
        title="AI 智能运维助手"
        subtitle="大模型驱动的智能运维：故障排查 / 健康诊断 / 巡检报告 / 知识问答"
        actions={
          !configLoading && !configOk ? (
            <Button variant="outlined" onClick={() => navigate('/settings')} startIcon={<IconWarning />}>
              前往配置 AI
            </Button>
          ) : (
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" onClick={clearChat} startIcon={<IconClear />}>
                清空对话
              </Button>
              <Button variant="text" onClick={() => void loadConfig()} startIcon={<IconRefresh />}>
                刷新
              </Button>
            </Stack>
          )
        }
      />

      {error && (
        <MuiAlert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </MuiAlert>
      )}

      {!configLoading && !configOk && (
        <MuiAlert severity="warning" sx={{ mb: 2 }}>
          AI 大模型尚未配置。请在「设置 → AI 大模型」中填写 API 地址与密钥，启用后即可使用智能运维能力。
        </MuiAlert>
      )}

      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <IconAi sx={{ color: theme.palette.primary.main }} />
            <Typography variant="subtitle2" sx={{ mr: 1 }}>
              推荐话题
            </Typography>
            <Divider orientation="vertical" flexItem />
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              {SUGGESTIONS.map((s) => (
                <Chip
                  key={s.label}
                  size="small"
                  icon={s.icon}
                  label={s.label}
                  clickable
                  variant="outlined"
                  onClick={() => onSuggestion(s.prompt)}
                  sx={{ '&:hover': { borderColor: theme.palette.primary.main, color: theme.palette.primary.main } }}
                />
              ))}
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {/* 对话列表 */}
      <Paper
        ref={listRef}
        sx={{
          mb: 2,
          p: 2,
          minHeight: 360,
          maxHeight: '52vh',
          overflow: 'auto',
          bgcolor: theme.palette.mode === 'dark' ? 'rgba(11,14,20,0.4)' : 'rgba(247,249,252,0.6)',
        }}
      >
        {messages.map((m, i) => (
          <Box
            key={i}
            sx={{
              display: 'flex',
              justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
              mb: 1.5,
            }}
          >
            <Box
              sx={{
                maxWidth: '82%',
                p: 1.5,
                borderRadius: 2,
                bgcolor: m.role === 'user'
                  ? theme.palette.primary.main
                  : theme.palette.mode === 'dark'
                    ? 'rgba(255,255,255,0.05)'
                    : 'rgba(15,23,42,0.04)',
                color: m.role === 'user' ? '#fff' : 'text.primary',
                border: m.role === 'user' ? 'none' : `1px solid ${theme.palette.divider}`,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: 14,
                lineHeight: 1.6,
              }}
            >
              {m.loading ? (
                <Stack direction="row" spacing={1} alignItems="center">
                  <CircularProgress size={16} />
                  <Typography variant="body2" color="text.secondary">AI 思考中…</Typography>
                </Stack>
              ) : (
                <>
                  {m.role === 'assistant' && (
                    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.5 }}>
                      <IconSparkle sx={{ fontSize: 14, color: theme.palette.primary.main }} />
                      <Typography variant="caption" sx={{ color: theme.palette.primary.main, fontWeight: 600 }}>
                        AI 助手
                      </Typography>
                      <Box sx={{ flexGrow: 1 }} />
                      <Tooltip title="复制回复">
                        <IconButton size="small" sx={{ p: 0.3 }} onClick={() => copyText(m.content, `msg-${i}`)}>
                          {copiedId === `msg-${i}` ? (
                            <IconCheck fontSize="small" sx={{ color: theme.palette.success.main }} />
                          ) : (
                            <IconCopy fontSize="small" sx={{ fontSize: 14, opacity: 0.6 }} />
                          )}
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  )}
                  {m.role === 'assistant' ? (
                    <Markdown text={m.typeLen != null && m.typeLen >= 0 ? m.content.slice(0, m.typeLen) : m.content} />
                  ) : (
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}>
                      {m.content}
                    </Typography>
                  )}
                </>
              )}
            </Box>
          </Box>
        ))}
      </Paper>

      {/* 清空确认 */}
      <Dialog open={confirmClear} onClose={() => setConfirmClear(false)} maxWidth="xs" fullWidth>
        <DialogTitle>确认清空</DialogTitle>
        <DialogContent>
          确定要清空当前对话吗？
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmClear(false)}>取消</Button>
          <Button color="error" variant="contained" onClick={doClearChat}>清空</Button>
        </DialogActions>
      </Dialog>

      {/* 输入区域 */}
      <Paper
        component="form"
        onSubmit={(e: React.FormEvent) => { e.preventDefault(); void ask(input) }}
        sx={{ p: 1, display: 'flex', gap: 1, alignItems: 'flex-end' }}
      >
        <TextField
          inputRef={inputRef}
          fullWidth
          size="small"
          multiline
          maxRows={4}
          placeholder={configOk ? "输入你的运维问题…" : "请先配置 AI 大模型"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!configOk || sending}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void ask(input)
            }
          }}
          sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'transparent' } }}
        />
        <IconButton
          type="submit"
          color="primary"
          disabled={!input.trim() || !configOk || sending}
          sx={{ flexShrink: 0, mb: 0.5 }}
        >
          {sending ? <CircularProgress size={20} /> : <IconSend />}
        </IconButton>
      </Paper>
    </Box>
  )
}