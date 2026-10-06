import { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Stack,
  MenuItem,
  TextField,
  Button,
  CircularProgress,
  Alert as MuiAlert,
  Tabs,
  Tab,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Paper,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Switch,
  Snackbar,
  Tooltip,
  Typography,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import type { Theme } from '@mui/material/styles'
import { Add as IconAdd, Delete as IconDelete, PlayArrow as IconEval, Refresh as IconRefresh, SmartToy as IconAi, PushPin as IconPin, MarkEmailRead as IconRead } from '@mui/icons-material'
import { api } from '../../capabilities/bus'
import type {
  Alert,
  AlertLevel,
  AlertState,
  AlertRule,
  AlertMetric,
  AlertOperator,
  Asset,
  Status,
} from '@shared/types'
import DataTable, { Column } from '../components/DataTable'
import StatusBadge from '../components/StatusBadge'
import PageHeader from '../components/PageHeader'
import AiDialog from '../components/AiDialog'
import ConfirmDialog from '../components/ConfirmDialog'

/** 严重度中文映射 */
const LEVEL_LABEL: Record<AlertLevel, string> = {
  P0: '紧急',
  P1: '严重',
  P2: '一般',
  P3: '轻微',
}

/** 严重度中文映射：P0 紧急 / P1 严重 / P2 一般 / P3 轻微。
 *  颜色取主题语义色（随深浅模式切换）：此前硬编码深色模式 hex，浅色底上对比度不足。 */
function levelColor(theme: Theme, level: AlertLevel): string {
  switch (level) {
    case 'P0':
      return theme.palette.error.main
    case 'P1':
      return theme.palette.warning.main
    case 'P2':
      return theme.palette.info.main
    case 'P3':
      return theme.palette.success.main
  }
}

function LevelChip({ level }: { level: AlertLevel }) {
  const theme = useTheme()
  const label = LEVEL_LABEL[level]
  const color = levelColor(theme, level)
  return (
    <Chip
      size="small"
      label={`${level} ${label}`}
      sx={{ bgcolor: `${color}1A`, color, fontWeight: 600, border: `1px solid ${color}33`, height: 24 }}
    />
  )
}

/** 「当前 89% / 阈值 80%」形式的指标展示（缺阈值时仅展示当前值） */
function thresholdText(r: Alert): string | null {
  if (r.currentValue == null) return null
  const u = r.unit ?? ''
  return r.threshold != null ? `当前 ${r.currentValue}${u} / 阈值 ${r.threshold}${u}` : `当前 ${r.currentValue}${u}`
}

const STATE_LABEL: Record<AlertState, string> = {
  active: '未处理',
  ack: '已确认',
  silenced: '已静默',
  resolved: '已解决',
}

function stateStatus(s: string): Status {
  if (s === 'active') return 'error' // 未处理：需要立即关注
  if (s === 'ack') return 'warn' // 已确认：处理中（此前与"已解决"同为绿色，语义混淆）
  if (s === 'silenced') return 'unknown'
  if (s === 'resolved') return 'ok'
  return 'ok'
}

const METRICS: { v: AlertMetric; label: string }[] = [
  { v: 'healthScore', label: '健康分' },
  { v: 'reachable', label: '在线状态' },
  { v: 'latency', label: '延迟(ms)' },
  { v: 'cpu', label: 'CPU 使用率(%)' },
  { v: 'mem', label: '内存使用率(%)' },
  { v: 'disk', label: '磁盘使用率(%)' },
  { v: 'netRx', label: '网络接收速率(KB/s)' },
  { v: 'netTx', label: '网络发送速率(KB/s)' },
]
const OPS: AlertOperator[] = ['>', '>=', '<', '<=', '==', '!=']

export default function Alerts() {
  const theme = useTheme()
  const [tab, setTab] = useState(0)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [rules, setRules] = useState<AlertRule[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [level, setLevel] = useState('')
  const [state, setState] = useState('')
  const [loading, setLoading] = useState(true)
  const [ruleLoading, setRuleLoading] = useState(true)
  const [error, setError] = useState('')
  const [actingId, setActingId] = useState('')
  const [snack, setSnack] = useState('')
  // AI 分析弹窗
  const [aiCtx, setAiCtx] = useState<{ title: string; payload: Record<string, unknown> } | null>(null)
  // 告警详情弹窗
  const [detail, setDetail] = useState<Alert | null>(null)
  // 规则删除确认 + 规则表单保存态/弹窗内错误
  const [confirmDeleteRule, setConfirmDeleteRule] = useState<AlertRule | null>(null)
  const [saving, setSaving] = useState(false)
  const [dialogError, setDialogError] = useState('')

  // 规则表单
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<AlertRule | null>(null)
  const [form, setForm] = useState<{
    name: string
    scope: 'all' | 'asset'
    assetId: string
    metric: AlertMetric
    operator: AlertOperator
    threshold: number
    level: AlertLevel
    message: string
  }>({ name: '', scope: 'all', assetId: '', metric: 'healthScore', operator: '<', threshold: 80, level: 'P3', message: '' })

  const loadAlerts = () => {
    setLoading(true)
    setError('')
    api.alerts
      .list((level || undefined) as AlertLevel | undefined, (state || undefined) as AlertState | undefined)
      .then(setAlerts)
      .catch((e) => setError((e as Error).message || '加载告警失败'))
      .finally(() => setLoading(false))
  }
  const loadRules = () => {
    setRuleLoading(true)
    Promise.all([api.alertRules.list(), api.assets.list()])
      .then(([r, a]) => {
        setRules(r)
        setAssets(a)
      })
      .catch((e) => setError((e as Error).message || '加载规则失败'))
      .finally(() => setRuleLoading(false))
  }

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    loadAlerts()
    loadRules()
  }, [])
  /* eslint-enable react-hooks/exhaustive-deps */

  const act = async (id: string, st: AlertState) => {
    setActingId(id)
    setError('')
    try {
      await api.alerts.patch(id, st)
      loadAlerts()
    } catch (e) {
      setError((e as Error).message || '操作失败')
    } finally {
      setActingId('')
    }
  }

  function openCreate() {
    setEditing(null)
    setForm({ name: '', scope: 'all', assetId: '', metric: 'healthScore', operator: '<', threshold: 80, level: 'P3', message: '' })
    setOpen(true)
  }
  function openEdit(r: AlertRule) {
    setEditing(r)
    setForm({
      name: r.name,
      scope: r.scope,
      assetId: r.assetId || '',
      metric: r.metric,
      operator: r.operator,
      threshold: r.threshold,
      level: r.level,
      message: r.message || '',
    })
    setOpen(true)
  }

  async function onSave() {
    if (saving) return
    setError('')
    if (form.scope === 'asset' && !form.assetId) {
      setError('范围选择「指定资产」时必须选择具体资产')
      return
    }
    if (!Number.isFinite(form.threshold)) {
      setError('阈值必须是有效数字')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        scope: form.scope,
        assetId: form.scope === 'asset' ? form.assetId : undefined,
        metric: form.metric,
        operator: form.operator,
        threshold: form.threshold,
        level: form.level,
        message: form.message || undefined,
      }
      if (editing) await api.alertRules.update(editing.id, payload)
      else await api.alertRules.create(payload)
      setOpen(false)
      loadRules()
    } catch (e) {
      // 保持在弹窗内展示：页面级错误会被打开的弹窗遮挡，用户只看到"点保存没反应"
      setDialogError((e as Error).message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(id: string) {
    try {
      await api.alertRules.remove(id)
      loadRules()
    } catch (e) {
      setError((e as Error).message || '删除失败')
    }
  }

  async function onToggle(r: AlertRule) {
    try {
      await api.alertRules.update(r.id, { enabled: !r.enabled })
      loadRules()
    } catch (e) {
      setError((e as Error).message || '更新失败')
    }
  }

  async function onEvaluate() {
    setError('')
    try {
      const res = await api.alertRules.evaluate()
      setSnack(`评估完成，新增 ${res.created} 条告警`)
      loadAlerts()
    } catch (e) {
      setError((e as Error).message || '评估失败')
    }
  }

  // 告警归属资产名（从规则表单加载的资产列表反查）
  const assetNameOf = (id?: string): string | undefined => assets.find((a) => a.id === id)?.name

  // 打开详情：自动标记已读
  const openDetail = (r: Alert) => {
    setDetail(r)
    if (!r.readAt) {
      api.alerts.markRead(r.id).then((a) => {
        setAlerts((prev) => prev.map((x) => (x.id === a.id ? a : x)))
      }).catch(() => {})
    }
  }

  // 置顶切换
  const togglePin = async (r: Alert) => {
    setError('')
    try {
      const a = await api.alerts.setPinned(r.id, !r.pinned)
      setAlerts((prev) => prev.map((x) => (x.id === a.id ? a : x)))
    } catch (e) {
      setError((e as Error).message || '置顶失败')
    }
  }

  // 标记已读（未读告警专属操作）
  const markRead = async (id: string) => {
    setError('')
    try {
      const a = await api.alerts.markRead(id)
      setAlerts((prev) => prev.map((x) => (x.id === a.id ? a : x)))
    } catch (e) {
      setError((e as Error).message || '操作失败')
    }
  }

  const cols: Column<Alert>[] = [
    { key: 'level', label: '级别', render: (r) => <LevelChip level={r.level} /> },
    {
      key: 'title',
      label: '标题',
      render: (r) => (
        <Box onClick={() => openDetail(r)} sx={{ cursor: 'pointer', opacity: r.readAt ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {!r.readAt && <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: theme.palette.primary.main, flexShrink: 0 }} />}
          <Typography variant="body2" sx={{ fontWeight: r.readAt ? 400 : 700 }}>{r.title}</Typography>
          {r.pinned && <IconPin fontSize="small" sx={{ color: theme.palette.warning.main, fontSize: 14 }} />}
          {thresholdText(r) && (
            <Typography variant="caption" component="div" sx={{ color: 'text.secondary', fontFamily: 'var(--font-mono)', fontSize: 12, mt: 0.25 }}>
              {thresholdText(r)}
            </Typography>
          )}
          {r.message && (
            <Typography
              variant="caption"
              component="div"
              sx={{
                color: r.level === 'P0' || r.level === 'P1' ? 'error.main' : 'warning.main',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                mt: 0.25,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 320,
              }}
            >
              {r.message}
            </Typography>
          )}
        </Box>
      ),
    },
    { key: 'assetId', label: '资产', render: (r) => assetNameOf(r.assetId) ?? r.assetId ?? '—' },
    {
      key: 'state',
      label: '状态',
      render: (r) => (
        <Stack direction="row" spacing={0.5} alignItems="center">
          <StatusBadge status={stateStatus(r.state)} label={STATE_LABEL[r.state]} />
          {!r.readAt && <Chip size="small" label="未读" color="primary" variant="outlined" sx={{ height: 18, fontSize: 10 }} />}
        </Stack>
      ),
    },
    { key: 'createdAt', label: '时间', render: (r) => new Date(r.createdAt).toLocaleString() },
    {
      key: '__actions',
      label: '操作',
      render: (r) => (
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Tooltip title={r.pinned ? '取消置顶' : '置顶'}>
            <IconButton size="small" onClick={() => togglePin(r)}>
              <IconPin fontSize="small" sx={{ color: r.pinned ? theme.palette.warning.main : undefined }} />
            </IconButton>
          </Tooltip>
          {!r.readAt && (
            <Tooltip title="标记已读">
              <IconButton size="small" onClick={() => markRead(r.id)}>
                <IconRead fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="AI 智能分析该告警">
            <IconButton size="small" onClick={() => setAiCtx({ title: `AI 分析：${r.title}`, payload: { level: r.level, title: r.title, message: r.message, assetId: r.assetId, assetName: assetNameOf(r.assetId) } })}>
              <IconAi fontSize="small" sx={{ color: theme.palette.primary.main }} />
            </IconButton>
          </Tooltip>
          {r.state === 'active' && (
            <Button size="small" variant="outlined" onClick={() => act(r.id, 'ack')} disabled={actingId === r.id}>
              确认
            </Button>
          )}
          {r.state !== 'silenced' && (
            <Button size="small" onClick={() => act(r.id, 'silenced')} disabled={actingId === r.id}>
              静默
            </Button>
          )}
          {r.state !== 'resolved' && (
            <Button size="small" color="success" onClick={() => act(r.id, 'resolved')} disabled={actingId === r.id}>
              解决
            </Button>
          )}
        </Stack>
      ),
    },
  ]

  // 排序：置顶优先 → 未读优先 → 时间倒序（useMemo：避免每次渲染产生新数组
  // 触发 DataTable 分页重置/子组件重渲染）
  const sortedAlerts = useMemo(
    () =>
      [...alerts].sort((a, b) => {
        if (a.pinned && !b.pinned) return -1
        if (!a.pinned && b.pinned) return 1
        if (!a.readAt && b.readAt) return -1
        if (a.readAt && !b.readAt) return 1
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      }),
    [alerts]
  )

  const metricLabel = (m: AlertMetric) => METRICS.find((x) => x.v === m)?.label ?? m

  return (
    <Box>
      <PageHeader
        title="告警中心"
        subtitle="分级（P0-P3）、可确认 / 静默 / 解决；规则引擎驱动自动告警"
        actions={
          tab === 1 && (
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" startIcon={<IconEval />} onClick={() => void onEvaluate()}>
                立即评估
              </Button>
              <Button variant="contained" startIcon={<IconAdd />} onClick={openCreate}>
                添加规则
              </Button>
            </Stack>
          )
        }
      />

      <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="告警列表" />
        <Tab label="告警规则" />
      </Tabs>

      {error && (
        <MuiAlert severity="error" sx={{ mb: 2 }}>
          {error}
        </MuiAlert>
      )}

      {tab === 0 ? (
        <Stack direction="row" spacing={1} mb={2}>
          <TextField select size="small" label="级别" value={level} onChange={(e) => setLevel(e.target.value)} sx={{ minWidth: 120 }}>
            <MenuItem value="">全部</MenuItem>
            {(['P0', 'P1', 'P2', 'P3'] as AlertLevel[]).map((l) => (
              <MenuItem key={l} value={l}>
                {l} · {LEVEL_LABEL[l]}
              </MenuItem>
            ))}
          </TextField>
          <TextField select size="small" label="状态" value={state} onChange={(e) => setState(e.target.value)} sx={{ minWidth: 120 }}>
            <MenuItem value="">全部</MenuItem>
            {['active', 'ack', 'silenced', 'resolved'].map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </TextField>
          <Button variant="outlined" onClick={loadAlerts} disabled={loading} startIcon={<IconRefresh />}>
            筛选
          </Button>
        </Stack>
      ) : null}

      {tab === 0 ? (
        loading ? (
          <Box display="flex" justifyContent="center" py={6}>
            <CircularProgress />
          </Box>
        ) : (
          <DataTable columns={cols} rows={sortedAlerts} emptyText="暂无告警" />
        )
      ) : ruleLoading ? (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress />
        </Box>
      ) : (
        <Paper sx={{ p: 0, overflow: 'hidden' }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>规则名</TableCell>
                <TableCell>范围</TableCell>
                <TableCell>指标</TableCell>
                <TableCell>条件</TableCell>
                <TableCell>级别</TableCell>
                <TableCell>启用</TableCell>
                <TableCell align="right">操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rules.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} sx={{ color: 'text.secondary' }}>
                    暂无规则，点击「添加规则」创建第一条告警策略。
                  </TableCell>
                </TableRow>
              )}
              {rules.map((r) => (
                <TableRow key={r.id}>
                  <TableCell sx={{ fontWeight: 600 }}>{r.name}</TableCell>
                  <TableCell>{r.scope === 'all' ? '全部资产' : `资产 ${r.assetId ?? ''}`}</TableCell>
                  <TableCell>{metricLabel(r.metric)}</TableCell>
                  <TableCell sx={{ fontFamily: 'var(--font-mono)' }}>
                    {r.operator} {r.threshold}
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={r.level} color={r.level === 'P0' || r.level === 'P1' ? 'error' : r.level === 'P2' ? 'warning' : 'default'} />
                  </TableCell>
                  <TableCell>
                    <Switch size="small" checked={r.enabled} onChange={() => void onToggle(r)} />
                  </TableCell>
                  <TableCell align="right">
                    <Button size="small" onClick={() => openEdit(r)}>
                      编辑
                    </Button>
                    <Tooltip title="删除规则">
                      <IconButton size="small" onClick={() => setConfirmDeleteRule(r)}>
                        <IconDelete fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      {/* 规则表单 */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{editing ? '编辑规则' : '添加规则'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {dialogError && <MuiAlert severity="error" onClose={() => setDialogError('')}>{dialogError}</MuiAlert>}
            <TextField label="规则名" fullWidth value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <TextField
              label="范围"
              select
              fullWidth
              value={form.scope}
              onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value as 'all' | 'asset' }))}
            >
              <MenuItem value="all">全部资产</MenuItem>
              <MenuItem value="asset">指定资产</MenuItem>
            </TextField>
            {form.scope === 'asset' && (
              <TextField label="资产" select fullWidth value={form.assetId} onChange={(e) => setForm((f) => ({ ...f, assetId: e.target.value }))}>
                {assets.map((a) => (
                  <MenuItem key={a.id} value={a.id}>
                    {a.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <TextField label="指标" select fullWidth value={form.metric} onChange={(e) => setForm((f) => ({ ...f, metric: e.target.value as AlertMetric }))}>
              {METRICS.map((m) => (
                <MenuItem key={m.v} value={m.v}>
                  {m.label}
                </MenuItem>
              ))}
            </TextField>
            <Stack direction="row" spacing={1}>
              <TextField
                label="运算符"
                select
                value={form.operator}
                onChange={(e) => setForm((f) => ({ ...f, operator: e.target.value as AlertOperator }))}
                sx={{ width: 100 }}
              >
                {OPS.map((o) => (
                  <MenuItem key={o} value={o}>
                    {o}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="阈值"
                type="number"
                value={form.threshold}
                onChange={(e) => setForm((f) => ({ ...f, threshold: Number(e.target.value) }))}
                sx={{ flex: 1 }}
              />
            </Stack>
            <TextField label="级别" select fullWidth value={form.level} onChange={(e) => setForm((f) => ({ ...f, level: e.target.value as AlertLevel }))}>
              {(['P0', 'P1', 'P2', 'P3'] as AlertLevel[]).map((l) => (
                <MenuItem key={l} value={l}>
                  {l} · {LEVEL_LABEL[l]}
                </MenuItem>
              ))}
            </TextField>
            <TextField label="消息（可选）" fullWidth value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={saving}>取消</Button>
          <Button variant="contained" disabled={!form.name || saving} onClick={() => void onSave()}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 规则删除确认 */}
      <ConfirmDialog
        open={!!confirmDeleteRule}
        title="删除告警规则"
        content={<>确定删除规则「{confirmDeleteRule?.name}」吗？删除后该规则不再产生新告警。</>}
        onConfirm={() => {
          if (confirmDeleteRule) void onDelete(confirmDeleteRule.id)
          setConfirmDeleteRule(null)
        }}
        onClose={() => setConfirmDeleteRule(null)}
      />

      {/* 告警详情弹窗 */}
      <Dialog open={!!detail} onClose={() => setDetail(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{detail ? `告警详情：${detail.title}` : ''}</DialogTitle>
        <DialogContent>
          {detail && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <LevelChip level={detail.level} />
                <StatusBadge status={stateStatus(detail.state)} label={STATE_LABEL[detail.state]} />
              </Stack>
              <Box>
                <Typography variant="caption" color="text.secondary">描述</Typography>
                <Typography variant="body2">{detail.message || '—'}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">指标</Typography>
                <Typography variant="body2" sx={{ fontFamily: 'var(--font-mono)' }}>
                  {thresholdText(detail) ?? '（非阈值类告警）'}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">关联资源</Typography>
                <Typography variant="body2">{assetNameOf(detail.assetId) ?? detail.assetId ?? '—'}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">时间</Typography>
                <Typography variant="body2">
                  创建：{new Date(detail.createdAt).toLocaleString()}
                  {detail.updatedAt && ` · 变更：${new Date(detail.updatedAt).toLocaleString()}`}
                  {detail.resolvedAt && ` · 解决：${new Date(detail.resolvedAt).toLocaleString()}`}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">同资源 / 同类型历史告警</Typography>
                {alerts.filter((a) => a.id !== detail.id && (a.assetId === detail.assetId || a.title === detail.title)).length === 0 ? (
                  <Typography variant="body2" color="text.secondary">暂无</Typography>
                ) : (
                  <Stack spacing={0.5}>
                    {alerts
                      .filter((a) => a.id !== detail.id && (a.assetId === detail.assetId || a.title === detail.title))
                      .slice(0, 10)
                      .map((a) => (
                        <Stack key={a.id} direction="row" spacing={1} alignItems="center" sx={{ fontSize: 12 }}>
                          <LevelChip level={a.level} />
                          <Typography variant="caption" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {a.title}
                          </Typography>
                          <StatusBadge status={stateStatus(a.state)} label={STATE_LABEL[a.state]} />
                          <Typography variant="caption" color="text.secondary">
                            {new Date(a.createdAt).toLocaleString()}
                          </Typography>
                        </Stack>
                      ))}
                  </Stack>
                )}
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetail(null)}>关闭</Button>
        </DialogActions>
      </Dialog>

      {/* AI 智能分析弹窗 */}
      <AiDialog
        open={!!aiCtx}
        title={aiCtx?.title ?? ''}
        context={aiCtx ? { kind: 'alert', payload: aiCtx.payload } : null}
        onClose={() => setAiCtx(null)}
      />

      <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack('')} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <MuiAlert severity="info" onClose={() => setSnack('')}>
          {snack}
        </MuiAlert>
      </Snackbar>
    </Box>
  )
}
