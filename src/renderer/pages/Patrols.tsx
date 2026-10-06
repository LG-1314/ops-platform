import { useEffect, useState } from 'react'
import {
  Grid,
  Box,
  Typography,
  Stack,
  Button,
  Card,
  CardContent,
  Divider,
  CircularProgress,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Tooltip,
  Switch,
  Checkbox,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material'
import { PlayArrow, Add, Edit as IconEdit, Delete as IconDelete, Schedule as IconSchedule } from '@mui/icons-material'
import { api } from '../../capabilities/bus'
import type { PatrolTask, PatrolLayer, PatrolRun, Status } from '@shared/types'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import EmptyState from '../components/EmptyState'
import ConfirmDialog from '../components/ConfirmDialog'
import { Alert as MuiAlert } from '@mui/material'

const LAYER_LABEL: Record<PatrolLayer, string> = {
  basic: '基础资源',
  middleware: '中间件',
  container: '容器',
  log: '日志',
  business: '业务',
}

const ALL_LAYERS: PatrolLayer[] = ['basic', 'middleware', 'container', 'log', 'business']

function runStatus(s: string): Status {
  if (s === 'failed') return 'error'
  if (s === 'running') return 'warn'
  if (s === 'success') return 'ok'
  return 'unknown'
}

// 执行状态中文映射（此前直接展示英文枚举 running/success/failed）
const RUN_LABEL: Record<string, string> = {
  running: '执行中',
  success: '成功',
  failed: '失败',
  idle: '待执行',
}

interface TaskForm {
  name: string
  cron: string
  layers: PatrolLayer[]
}

const emptyForm = (): TaskForm => ({ name: '', cron: '0 * * * *', layers: ['basic'] })

export default function Patrols() {
  const [tasks, setTasks] = useState<PatrolTask[]>([])
  const [loading, setLoading] = useState(true)
  const [runningId, setRunningId] = useState('')
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<TaskForm>(emptyForm())
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [batchRunning, setBatchRunning] = useState(false)
  // 删除确认（单删 + 批量删均不可逆，此前一次点击直接执行）
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [batchConfirm, setBatchConfirm] = useState(false)

  const load = () => {
    setLoading(true)
    setError('')
    api.patrols
      .list()
      .then(setTasks)
      .catch((e) => setError((e as Error).message || '加载失败'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const run = async (id: string) => {
    setRunningId(id)
    setError('')
    try {
      await api.patrols.run(id)
      load()
    } catch (e) {
      setError((e as Error).message || '执行失败')
    } finally {
      setRunningId('')
    }
  }

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm())
    setOpen(true)
  }

  const openEdit = (t: PatrolTask) => {
    setEditingId(t.id)
    setForm({ name: t.name, cron: t.cron, layers: t.layers })
    setOpen(true)
  }

  const onSave = async () => {
    if (!form.name.trim()) {
      setError('任务名称必填')
      return
    }
      setError('')
      // cron 5 段格式校验：非法表达式会被调度器静默忽略（永远不触发），必须在前端拦住
      const cronParts = form.cron.trim().split(/\s+/)
      if (cronParts.length !== 5) {
        setError('Cron 表达式需为 5 段格式（分 时 日 月 周），例如：0 * * * *')
        return
      }
      try {
        const payload = { name: form.name.trim(), cron: form.cron.trim(), layers: form.layers }
        if (editingId) await api.patrols.update(editingId, payload)
        else await api.patrols.create(payload)
        setOpen(false)
        load()
      } catch (e) {
        setError((e as Error).message || '保存失败')
      }
  }

  const onToggle = async (t: PatrolTask, enabled: boolean) => {
    try {
      await api.patrols.update(t.id, { enabled })
      load()
    } catch (e) {
      setError((e as Error).message || '更新失败')
    }
  }

  const onDelete = async (id: string) => {
    setConfirmDeleteId(null)
    try {
      await api.patrols.remove(id)
      setSelected((s) => s.filter((x) => x !== id))
      load()
    } catch (e) {
      setError((e as Error).message || '删除失败')
    }
  }

  const toggleSelected = (id: string) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  const toggleSelectAll = () => {
    setSelected((s) => (s.length === tasks.length ? [] : tasks.map((t) => t.id)))
  }

  const runBatch = async (action: 'enable' | 'disable' | 'delete') => {
    setBatchConfirm(false)
    setBatchRunning(true)
    setError('')
    const failed: string[] = []
    for (const id of selected) {
      try {
        if (action === 'delete') await api.patrols.remove(id)
        else await api.patrols.update(id, { enabled: action === 'enable' })
      } catch {
        failed.push(id)
      }
    }
    if (failed.length > 0) setError(`批量操作有 ${failed.length} 项失败`)
    setSelected([])
    setBatchRunning(false)
    load()
  }

  const toggleLayer = (l: PatrolLayer) => {
    setForm((f) => ({
      ...f,
      layers: f.layers.includes(l) ? f.layers.filter((x) => x !== l) : [...f.layers, l],
    }))
  }

  return (
    <Box>
      <PageHeader
        title="智能巡检"
        subtitle="基础资源 / 中间件 / 容器 / 日志 / 业务 多层巡检编排 · 支持增删改查与定时执行"
        actions={
          <Button variant="contained" startIcon={<Add />} onClick={openCreate}>
            新建巡检
          </Button>
        }
      />

      {error && (
        <MuiAlert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </MuiAlert>
      )}

      {!loading && tasks.length > 0 && (
        <Card sx={{ mb: 2 }}>
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Checkbox
                size="small"
                checked={selected.length === tasks.length}
                indeterminate={selected.length > 0 && selected.length < tasks.length}
                onChange={toggleSelectAll}
              />
              <Typography variant="body2" color="text.secondary">
                已选 {selected.length} / {tasks.length} 项
              </Typography>
              <Box flex={1} />
              <Button
                size="small"
                variant="outlined"
                disabled={selected.length === 0 || batchRunning}
                onClick={() => runBatch('enable')}
              >
                批量启用
              </Button>
              <Button
                size="small"
                variant="outlined"
                disabled={selected.length === 0 || batchRunning}
                onClick={() => runBatch('disable')}
              >
                批量禁用
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="error"
                disabled={selected.length === 0 || batchRunning}
                onClick={() => setBatchConfirm(true)}
              >
                批量删除
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress />
        </Box>
      ) : tasks.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              text="暂无巡检任务"
              description="点击「新建巡检」创建一条定时巡检任务，自动检测主机健康并生成报告"
              icon={<IconSchedule />}
              action={
                <Button variant="contained" startIcon={<Add />} onClick={openCreate}>
                  新建巡检
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={2}>
          {tasks.map((t) => (
            <Grid item xs={12} md={6} key={t.id}>
              <Card>
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="subtitle1">{t.name}</Typography>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <StatusBadge status={runStatus(t.status)} label={RUN_LABEL[t.status] ?? t.status} />
                      <Switch size="small" checked={t.enabled} onChange={(_, v) => onToggle(t, v)} />
                      <Checkbox
                        size="small"
                        checked={selected.includes(t.id)}
                        onChange={() => toggleSelected(t.id)}
                      />
                    </Stack>
                  </Stack>
                  <Divider sx={{ my: 1.5 }} />
                  <Stack direction="row" spacing={0.5} mb={1} flexWrap="wrap" useFlexGap>
                    {t.layers.map((l) => (
                      <Chip key={l} size="small" label={LAYER_LABEL[l]} color="primary" variant="outlined" />
                    ))}
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    Cron：{t.cron}
                    {t.lastRunAt ? ` · 上次执行：${new Date(t.lastRunAt).toLocaleString()}` : ' · 尚未执行'}
                  </Typography>

                  <Box mt={1.5}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={runningId === t.id ? <CircularProgress size={16} color="inherit" /> : <PlayArrow />}
                        disabled={runningId === t.id}
                        onClick={() => run(t.id)}
                      >
                        {runningId === t.id ? '执行中…' : '立即执行'}
                      </Button>
                      <Tooltip title="编辑">
                        <IconButton size="small" onClick={() => openEdit(t)}>
                          <IconEdit fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="删除">
                        <IconButton size="small" color="error" onClick={() => setConfirmDeleteId(t.id)}>
                          <IconDelete fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Box>

                  {t.history.length > 0 && (
                    <Box mt={1.5}>
                      <Typography variant="caption" color="text.secondary">
                        最近执行
                      </Typography>
                      {t.history.slice(-2).reverse().map((h: PatrolRun) => (
                        <Box
                          key={h.id}
                          sx={{
                            mt: 0.5,
                            p: 1,
                            bgcolor: 'action.hover',
                            borderRadius: 1,
                          }}
                        >
                          <Stack direction="row" spacing={1} alignItems="center">
                            <StatusBadge status={runStatus(h.status)} label={RUN_LABEL[h.status] ?? h.status} />
                            <Typography variant="caption">
                              {new Date(h.startedAt).toLocaleString()}
                            </Typography>
                          </Stack>
                          <Typography variant="caption" color="text.secondary">
                            {h.summary}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* 新建 / 编辑巡检 */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{editingId ? '编辑巡检任务' : '新建巡检任务'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="任务名称"
              fullWidth
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <TextField
              label="Cron 表达式"
              fullWidth
              value={form.cron}
              onChange={(e) => setForm((f) => ({ ...f, cron: e.target.value }))}
            />
            <Typography variant="caption" color="text.secondary">
              巡检层级（可多选）
            </Typography>
            {/* 此前误用 Tabs 组件做多选：第一个 Tab 永远呈选中态，语义也不对；改用多选按钮组 */}
            <ToggleButtonGroup size="small" aria-label="巡检层级多选">
              {ALL_LAYERS.map((l) => (
                <ToggleButton
                  key={l}
                  value={l}
                  selected={form.layers.includes(l)}
                  onClick={() => toggleLayer(l)}
                  sx={{ textTransform: 'none', fontWeight: form.layers.includes(l) ? 700 : 400 }}
                >
                  {LAYER_LABEL[l]}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              {form.layers.map((l) => (
                <Chip key={l} size="small" label={LAYER_LABEL[l]} color="primary" onDelete={() => toggleLayer(l)} />
              ))}
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>取消</Button>
          <Button variant="contained" onClick={onSave} disabled={!form.name.trim()}>
            {editingId ? '保存' : '创建'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 单任务删除确认 */}
      <ConfirmDialog
        open={!!confirmDeleteId}
        title="删除巡检任务"
        content="确定删除该巡检任务吗？其历史执行记录将一并移除。"
        onConfirm={() => confirmDeleteId && void onDelete(confirmDeleteId)}
        onClose={() => setConfirmDeleteId(null)}
      />

      {/* 批量删除确认 */}
      <ConfirmDialog
        open={batchConfirm}
        title="批量删除巡检任务"
        content={`确定删除选中的 ${selected.length} 个巡检任务吗？此操作不可恢复。`}
        onConfirm={() => void runBatch('delete')}
        onClose={() => setBatchConfirm(false)}
      />
    </Box>
  )
}