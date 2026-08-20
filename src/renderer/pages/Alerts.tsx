import { useEffect, useState } from 'react'
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
} from '@mui/material'
import { Add as IconAdd, Delete as IconDelete, PlayArrow as IconEval, Refresh as IconRefresh } from '@mui/icons-material'
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

function levelStatus(l: string): Status {
  if (l === 'P0' || l === 'P1') return 'error'
  if (l === 'P2') return 'warn'
  return 'unknown'
}
function stateStatus(s: string): Status {
  if (s === 'active') return 'warn'
  if (s === 'resolved') return 'ok'
  if (s === 'silenced') return 'unknown'
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
    setError('')
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
      setError((e as Error).message || '保存失败')
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

  const cols: Column<Alert>[] = [
    { key: 'level', label: '级别', render: (r) => <StatusBadge status={levelStatus(r.level)} label={r.level} /> },
    { key: 'title', label: '标题' },
    { key: 'assetId', label: '资产', render: (r) => r.assetId ?? '—' },
    { key: 'state', label: '状态', render: (r) => <StatusBadge status={stateStatus(r.state)} label={r.state} /> },
    { key: 'createdAt', label: '时间', render: (r) => new Date(r.createdAt).toLocaleString() },
    {
      key: '__actions',
      label: '操作',
      render: (r) => (
        <Stack direction="row" spacing={1}>
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
            {['P0', 'P1', 'P2', 'P3'].map((l) => (
              <MenuItem key={l} value={l}>
                {l}
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
          <DataTable columns={cols} rows={alerts} emptyText="暂无告警" />
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
                  <TableCell sx={{ fontFamily: 'monospace' }}>
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
                    <IconButton size="small" onClick={() => void onDelete(r.id)}>
                      <IconDelete fontSize="small" />
                    </IconButton>
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
              {['P0', 'P1', 'P2', 'P3'].map((l) => (
                <MenuItem key={l} value={l}>
                  {l}
                </MenuItem>
              ))}
            </TextField>
            <TextField label="消息（可选）" fullWidth value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>取消</Button>
          <Button variant="contained" disabled={!form.name} onClick={() => void onSave()}>
            保存
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack('')} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <MuiAlert severity="info" onClose={() => setSnack('')}>
          {snack}
        </MuiAlert>
      </Snackbar>
    </Box>
  )
}
