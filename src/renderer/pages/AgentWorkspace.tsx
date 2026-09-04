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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
  Switch,
  MenuItem,
  useTheme,
  Avatar,
} from '@mui/material'
import {
  SmartToy as IconAi,
  Send as IconSend,
  Add as IconAdd,
  Edit as IconEdit,
  Delete as IconDelete,
  BugReport,
  FactCheck,
  Terminal as IconDeploy,
  Article as IconLog,
  Quiz,
  TrendingUp,
  Security,
  Psychology,
  Notifications as IconAlert,
  Computer as IconHost,
  Assignment as IconReport,
  Refresh as IconRefresh,
} from '@mui/icons-material'
import { api } from '../../capabilities/bus'
import PageHeader from '../components/PageHeader'
import Markdown from '../components/Markdown'
import type { AiAgent } from '@shared/types'

const ICONS: Record<string, React.ReactNode> = {
  troubleshoot: <BugReport />,
  patrol: <FactCheck />,
  deploy: <IconDeploy />,
  log: <IconLog />,
  qa: <Quiz />,
  risk: <TrendingUp />,
  security: <Security />,
}
const DEFAULT_ICON = <Psychology />

interface ChatEntry {
  role: 'user' | 'assistant'
  content: string
  loading?: boolean
}

const CONTEXT_ACTIONS = [
  { key: 'alerts', label: '分析全部告警', icon: <IconAlert fontSize="small" />, prompt: '请分析当前平台全部活跃告警，评估整体风险并给出处置优先级。' },
  { key: 'hosts', label: '分析主机健康', icon: <IconHost fontSize="small" />, prompt: '请分析当前平台全部主机的健康状态与主要风险。' },
  { key: 'report', label: '生成巡检报告', icon: <IconReport fontSize="small" />, prompt: '请生成一份完整的企业运维巡检报告。' },
]

const emptyAgentForm = () => ({
  name: '',
  role: '',
  description: '',
  systemPrompt: '',
  icon: 'qa',
  enabled: true,
})

export default function AgentWorkspace() {
  const theme = useTheme()
  const [agents, setAgents] = useState<AiAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState('')
  const [error, setError] = useState('')

  // 对话
  const [messages, setMessages] = useState<ChatEntry[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // 智能体管理
  const [manageOpen, setManageOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState<AiAgent | null>(null)
  const [form, setForm] = useState(emptyAgentForm())
  const [saving, setSaving] = useState(false)

  const [configOk, setConfigOk] = useState(false)
  const [confirmDeleteAgent, setConfirmDeleteAgent] = useState<AiAgent | null>(null)

  const loadAgents = async () => {
    setLoading(true)
    setError('')
    try {
      const list = await api.ai.agents.list()
      setAgents(list)
      if (list.length && !selectedId) setSelectedId(list[0].id)
      else if (list.length === 0) setSelectedId('')
    } catch (e) {
      setError((e as Error).message || '加载智能体失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAgents()
    api.ai.config().then((c) => setConfigOk(c.enabled && c.hasApiKey)).catch(() => setConfigOk(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selected = agents.find((a) => a.id === selectedId) || null

  // 切换智能体 → 欢迎语
  useEffect(() => {
    if (selected) {
      setMessages([
        {
          role: 'assistant',
          content: `你好，我是「${selected.name}」（${selected.role}）。\n\n${selected.description || '请描述你遇到的运维问题，我会基于平台数据给出专业分析与建议。'}`,
        },
      ])
    } else {
      setMessages([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  // 自动滚动
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  const ask = async (text: string, context?: { kind: string; payload: Record<string, unknown> }) => {
    const q = (text || '').trim()
    if (!selectedId || !q || sending) return
    setInput('')
    setError('')
    const userMsg: ChatEntry = { role: 'user', content: q }
    const loadingMsg: ChatEntry = { role: 'assistant', content: '', loading: true }
    setMessages((prev) => [...prev, userMsg, loadingMsg])
    setSending(true)
    try {
      const res = await api.ai.agents.chat(selectedId, [{ role: 'user', content: q }], context)
      setMessages((prev) => {
        const next = [...prev]
        const idx = next.findIndex((m) => m.loading)
        if (idx >= 0) next[idx] = { role: 'assistant', content: res.reply }
        return next
      })
    } catch (e) {
      setMessages((prev) => prev.filter((m) => !m.loading))
      setError((e as Error).message || 'AI 请求失败')
    } finally {
      setSending(false)
    }
  }

  const onContextAction = async (action: (typeof CONTEXT_ACTIONS)[number]) => {
    setError('')
    try {
      let payload: Record<string, unknown> = {}
      if (action.key === 'alerts') {
        const alerts = await api.alerts.list()
        payload = {
          活跃告警总数: alerts.filter((a) => a.state === 'active' || a.state === 'ack').length,
          告警: alerts.slice(0, 15).map((a) => ({ 级别: a.level, 标题: a.title, 状态: a.state, 详情: a.message })),
        }
      } else if (action.key === 'hosts') {
        const mon = await api.monitor.summary()
        payload = {
          在线主机: mon.hosts.filter((h) => h.reachable).length,
          离线主机: mon.hosts.filter((h) => h.reachable === false).length,
          主机: mon.hosts.slice(0, 15).map((h) => ({
            名称: h.name, 地址: h.host, 状态: h.reachable ? '在线' : '离线', 健康分: h.healthScore,
            CPU: h.cpuPct != null ? `${h.cpuPct}%` : '-', 内存: h.memPct != null ? `${h.memPct}%` : '-', 磁盘: h.diskPct != null ? `${h.diskPct}%` : '-',
          })),
        }
      }
      // 生成巡检报告走专用接口（更贴近真实数据）
      if (action.key === 'report') {
        const r = await api.ai.report()
        await ask(`已将平台巡检报告生成完毕，请基于以下报告内容做要点提炼与整改建议：\n\n${r.report}`, undefined)
        return
      }
      await ask(action.prompt, { kind: 'report', payload })
    } catch (e) {
      setError((e as Error).message || '加载上下文失败')
    }
  }

  const openCreate = () => {
    setEditingAgent(null)
    setForm(emptyAgentForm())
    setManageOpen(true)
  }
  const openEdit = (a: AiAgent) => {
    setEditingAgent(a)
    setForm({
      name: a.name,
      role: a.role,
      description: a.description,
      systemPrompt: a.systemPrompt,
      icon: a.icon || 'qa',
      enabled: a.enabled,
    })
    setManageOpen(true)
  }

  const onSave = async () => {
    if (!form.name.trim() || !form.systemPrompt.trim()) {
      setError('名称与系统提示词必填')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = {
        name: form.name.trim(),
        role: form.role.trim() || form.name.trim(),
        description: form.description.trim(),
        systemPrompt: form.systemPrompt.trim(),
        icon: form.icon,
        enabled: form.enabled,
      }
      if (editingAgent) await api.ai.agents.update(editingAgent.id, payload)
      else await api.ai.agents.create(payload)
      setManageOpen(false)
      await loadAgents()
    } catch (e) {
      setError((e as Error).message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const onToggle = async (a: AiAgent, enabled: boolean) => {
    try {
      await api.ai.agents.update(a.id, { enabled })
      loadAgents()
    } catch (e) {
      setError((e as Error).message || '更新失败')
    }
  }

  const onDelete = (a: AiAgent) => {
    setConfirmDeleteAgent(a)
  }

  const doDeleteAgent = async () => {
    if (!confirmDeleteAgent) return
    try {
      await api.ai.agents.remove(confirmDeleteAgent.id)
      setSelectedId((prev) => (prev === confirmDeleteAgent.id ? '' : prev))
      setConfirmDeleteAgent(null)
      await loadAgents()
    } catch (e) {
      setError((e as Error).message || '删除失败')
    }
  }

  const selectedIcon = (a?: AiAgent | null) => ICONS[a?.icon || ''] || DEFAULT_ICON

  return (
    <Box>
      <PageHeader
        title="AI 智能体工作台"
        subtitle="角色化运维专家：故障排查 / 巡检分析 / 部署配置 / 日志清洗 / 风险预判 / 安全审计"
        actions={
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <IconRefresh />}
              onClick={() => void loadAgents()}
            >
              刷新
            </Button>
            <Button variant="contained" startIcon={<IconAdd />} onClick={openCreate}>
              新建智能体
            </Button>
          </Stack>
        }
      />

      {error && (
        <MuiAlert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </MuiAlert>
      )}

      {!configOk && (
        <MuiAlert severity="warning" sx={{ mb: 2 }}>
          AI 大模型尚未配置。请在「设置 → AI 大模型」中填写 API 地址与密钥后使用智能体。
        </MuiAlert>
      )}

      <GridContainer>
        {/* 左：智能体列表 */}
        <Box sx={{ width: { xs: '100%', md: 300 }, flexShrink: 0 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 1.5 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1, py: 0.5 }}>
                <IconAi sx={{ color: theme.palette.primary.main, fontSize: 20 }} />
                <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
                  智能体（{agents.length}）
                </Typography>
                <Tooltip title="新建智能体">
                  <IconButton size="small" onClick={openCreate}><IconAdd fontSize="small" /></IconButton>
                </Tooltip>
              </Stack>
              <Divider sx={{ my: 1 }} />
              <Stack spacing={0.5}>
                {agents.map((a) => (
                  <Box
                    key={a.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(a.id)}
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedId(a.id)}
                    sx={{
                      p: 1,
                      borderRadius: 2,
                      cursor: 'pointer',
                      bgcolor: selectedId === a.id ? 'primary.main' : 'action.hover',
                      color: selectedId === a.id ? '#fff' : 'text.primary',
                      transition: 'background 0.2s',
                      '&:hover': { filter: 'brightness(1.05)' },
                    }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Avatar
                        sx={{
                          width: 30,
                          height: 30,
                          bgcolor: selectedId === a.id ? 'rgba(255,255,255,0.2)' : theme.palette.primary.main,
                          color: '#fff',
                          fontSize: 16,
                        }}
                      >
                        {selectedIcon(a)}
                      </Avatar>
                      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {a.name}
                        </Typography>
                        <Typography variant="caption" sx={{ opacity: 0.75, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {a.role}
                        </Typography>
                      </Box>
                      <Switch
                        size="small"
                        checked={a.enabled}
                        onChange={(_, v) => onToggle(a, v)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </Stack>
                  </Box>
                ))}
                {agents.length === 0 && (
                  <Typography variant="caption" color="text.secondary" sx={{ p: 1 }}>
                    暂无智能体，点击右上角「新建智能体」创建。
                  </Typography>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Box>

        {/* 右：对话工作区 */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Card>
            <CardContent sx={{ p: 1.5 }}>
              {/* 智能体头部 + 上下文快捷操作 */}
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ px: 0.5, pb: 1 }}>
                {selected && (
                  <>
                    <Avatar sx={{ width: 32, height: 32, bgcolor: theme.palette.primary.main, color: '#fff', fontSize: 18 }}>
                      {selectedIcon(selected)}
                    </Avatar>
                    <Box sx={{ mr: 1 }}>
                      <Typography variant="subtitle2">{selected.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{selected.role}</Typography>
                    </Box>
                  </>
                )}
                <Box sx={{ flexGrow: 1 }} />
                {CONTEXT_ACTIONS.map((c) => (
                  <Chip
                    key={c.label}
                    size="small"
                    icon={c.icon}
                    label={c.label}
                    clickable
                    variant="outlined"
                    disabled={!selectedId || sending}
                    onClick={() => onContextAction(c)}
                  />
                ))}
                {selected && (
                  <>
                    <Tooltip title="编辑智能体">
                      <IconButton size="small" onClick={() => openEdit(selected)}><IconEdit fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title="删除智能体">
                      <IconButton size="small" color="error" onClick={() => onDelete(selected)}><IconDelete fontSize="small" /></IconButton>
                    </Tooltip>
                  </>
                )}
              </Stack>
              <Divider sx={{ mb: 1 }} />

              {/* 对话区 */}
              <Box
                ref={listRef}
                sx={{
                  height: 'calc(100vh - 340px)',
                  minHeight: 320,
                  overflow: 'auto',
                  bgcolor: theme.palette.mode === 'dark' ? 'rgba(11,14,20,0.4)' : 'rgba(247,249,252,0.6)',
                  borderRadius: 1,
                  p: 1.5,
                }}
              >
                {messages.length === 0 && !selectedId && (
                  <Box textAlign="center" py={6}>
                    <IconAi sx={{ fontSize: 40, color: theme.palette.text.disabled }} />
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      从左侧选择一个智能体开始对话
                    </Typography>
                  </Box>
                )}
                {messages.map((m, i) => (
                  <Box key={i} sx={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', mb: 1.5 }}>
                    <Box
                      sx={{
                        maxWidth: '84%',
                        p: 1.5,
                        borderRadius: 2,
                        bgcolor: m.role === 'user' ? theme.palette.primary.main : theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.04)',
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
                          <Typography variant="body2" color="text.secondary">思考中…</Typography>
                        </Stack>
                      ) : m.role === 'assistant' ? (
                        <Markdown text={m.content} />
                      ) : (
                        <Typography variant="body2" component="div" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}>
                          {m.content}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                ))}
              </Box>

              {/* 输入区 */}
              <Paper
                component="form"
                onSubmit={(e: React.FormEvent) => { e.preventDefault(); void ask(input) }}
                sx={{ mt: 1, p: 1, display: 'flex', gap: 1, alignItems: 'flex-end' }}
              >
                <TextField
                  inputRef={inputRef}
                  fullWidth
                  size="small"
                  multiline
                  maxRows={4}
                  placeholder={selectedId ? `向「${selected?.name || ''}」提问…` : '请先选择智能体'}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={!selectedId || !configOk || sending}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void ask(input)
                    }
                  }}
                  sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'transparent' } }}
                />
                <IconButton type="submit" color="primary" disabled={!input.trim() || !selectedId || !configOk || sending} sx={{ flexShrink: 0, mb: 0.5 }}>
                  {sending ? <CircularProgress size={20} /> : <IconSend />}
                </IconButton>
              </Paper>
            </CardContent>
          </Card>
        </Box>
      </GridContainer>

      {/* 删除确认 */}
      <Dialog open={!!confirmDeleteAgent} onClose={() => setConfirmDeleteAgent(null)} maxWidth="xs" fullWidth>
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          确定要删除智能体「{confirmDeleteAgent?.name}」吗？
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteAgent(null)}>取消</Button>
          <Button color="error" variant="contained" onClick={() => void doDeleteAgent()}>删除</Button>
        </DialogActions>
      </Dialog>

      {/* 新建 / 编辑智能体 */}
      <Dialog open={manageOpen} onClose={() => setManageOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingAgent ? '编辑智能体' : '新建智能体'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField
                label="名称"
                fullWidth
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="如 数据库专家"
              />
              <TextField
                label="角色标题"
                fullWidth
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                placeholder="如 数据库故障诊断"
              />
            </Stack>
            <TextField
              label="简介（对话欢迎语展示）"
              fullWidth
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="一句话说明该智能体的专长"
            />
            <TextField
              label="系统提示词（角色人格设定）"
              fullWidth
              multiline
              minRows={5}
              value={form.systemPrompt}
              onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
              placeholder="你是运维专家…"
            />
            <Stack direction="row" spacing={1.5} alignItems="center">
              <TextField
                label="图标"
                select
                value={form.icon}
                onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                sx={{ width: 200 }}
              >
                <MenuItem value="troubleshoot">故障排查</MenuItem>
                <MenuItem value="patrol">巡检分析</MenuItem>
                <MenuItem value="deploy">部署配置</MenuItem>
                <MenuItem value="log">日志清洗</MenuItem>
                <MenuItem value="qa">知识问答</MenuItem>
                <MenuItem value="risk">风险预判</MenuItem>
                <MenuItem value="security">安全审计</MenuItem>
              </TextField>
              <FormSwitchLabel
                label="启用"
                checked={form.enabled}
                onChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
              />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setManageOpen(false)}>取消</Button>
          <Button variant="contained" disabled={saving} onClick={onSave}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

// 简单 flex 布局容器
function GridContainer({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2 }}>
      {children}
    </Box>
  )
}

// 表单开关
function FormSwitchLabel({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Switch size="small" checked={checked} onChange={(_, v) => onChange(v)} />
      <Typography variant="body2">{label}</Typography>
    </Stack>
  )
}