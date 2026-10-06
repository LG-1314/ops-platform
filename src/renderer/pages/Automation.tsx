import { useEffect, useState } from 'react'
import {
  Grid,
  Box,
  Typography,
  Stack,
  Card,
  CardContent,
  Divider,
  CircularProgress,
  Alert as MuiAlert,
  useTheme,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  IconButton,
  Tooltip,
} from '@mui/material'
import {
  BugReport,
  AccountTree,
  Add as IconAdd,
  Delete as IconDelete,
  Flag as IconFlow,
  PlayArrow as IconRun,
  EditOutlined,
} from '@mui/icons-material'
import { api } from '../../capabilities/bus'
import type {
  Incident,
  CicdPipeline,
  AlertLevel,
  IncidentState,
  Status,
} from '@shared/types'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import EmptyState from '../components/EmptyState'
import ConfirmDialog from '../components/ConfirmDialog'

function incidentStatus(s: string): Status {
  if (s === 'open') return 'error'
  if (s === 'investigating') return 'warn'
  if (s === 'postmortem') return 'unknown'
  return 'ok'
}
function levelStatus(l: string): Status {
  if (l === 'P0' || l === 'P1') return 'error'
  if (l === 'P2') return 'warn'
  return 'unknown'
}
function cicdStatus(s: string): Status {
  if (s === 'failed') return 'error'
  if (s === 'running') return 'warn'
  if (s === 'pending') return 'unknown'
  return 'ok'
}

const STATE_LABEL: Record<IncidentState, string> = {
  open: '待处理',
  investigating: '排查中',
  resolved: '已解决',
  postmortem: '复盘',
}

// CI/CD 流水线状态中文映射（台账展示统一中文，不再直接显示英文枚举值）
const CICD_LABEL: Record<CicdPipeline['status'], string> = {
  pending: '待运行',
  running: '运行中',
  success: '成功',
  failed: '失败',
}
const CICD_STAGES: { value: string; label: string }[] = [
  { value: 'build', label: '构建' },
  { value: 'test', label: '测试' },
  { value: 'deploy', label: '部署' },
  { value: 'verify', label: '验证' },
  { value: 'release', label: '发布' },
]

const STATE_FLOW: IncidentState[] = ['open', 'investigating', 'resolved', 'postmortem']

const emptyIncident = () => ({
  title: '',
  level: 'P2' as AlertLevel,
  assignee: '',
})

const emptyPipeline = () => ({
  name: '',
  stage: 'build' as string,
  status: 'pending' as CicdPipeline['status'],
})

export default function Automation() {
  const theme = useTheme()
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [cicd, setCicd] = useState<CicdPipeline[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 事故表单
  const [incOpen, setIncOpen] = useState(false)
  const [incForm, setIncForm] = useState(emptyIncident())
  const [incSaving, setIncSaving] = useState(false)
  const [incEditId, setIncEditId] = useState<string | null>(null)

  // 流水线表单
  const [pipeOpen, setPipeOpen] = useState(false)
  const [pipeForm, setPipeForm] = useState(emptyPipeline())
  const [pipeSaving, setPipeSaving] = useState(false)
  const [pipeEditId, setPipeEditId] = useState<string | null>(null)
  const [runningId, setRunningId] = useState('')

  // 删除确认（此前单击删除图标立即执行）
  const [confirmDelete, setConfirmDelete] = useState<{ kind: 'incident' | 'pipeline'; id: string; name: string } | null>(null)

  const load = () => {
    setLoading(true)
    setError('')
    Promise.all([api.automation.incidents(), api.automation.cicd()])
      .then(([i, c]) => {
        setIncidents(i)
        setCicd(c)
      })
      .catch((e) => setError((e as Error).message || '加载自动化数据失败'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const flowIncident = async (inc: Incident) => {
    const idx = STATE_FLOW.indexOf(inc.state)
    const next = STATE_FLOW[Math.min(idx + 1, STATE_FLOW.length - 1)]
    setError('')
    try {
      await api.automation.patchIncident(inc.id, next)
      load()
    } catch (e) {
      setError((e as Error).message || '流转失败')
    }
  }

  const removeIncident = async (id: string) => {
    setConfirmDelete(null)
    setError('')
    try {
      await api.automation.removeIncident(id)
      load()
    } catch (e) {
      setError((e as Error).message || '删除失败')
    }
  }

  const openAddIncident = () => {
    setIncEditId(null)
    setIncForm(emptyIncident())
    setIncOpen(true)
  }

  const openEditIncident = (inc: Incident) => {
    setIncEditId(inc.id)
    setIncForm({ title: inc.title, level: inc.level, assignee: inc.assignee || '' })
    setIncOpen(true)
  }

  const createIncident = async () => {
    setIncSaving(true)
    setError('')
    try {
      const payload = { title: incForm.title, level: incForm.level, assignee: incForm.assignee || undefined }
      if (incEditId) await api.automation.updateIncident(incEditId, payload)
      else await api.automation.createIncident(payload)
      setIncOpen(false)
      setIncForm(emptyIncident())
      load()
    } catch (e) {
      setError((e as Error).message || '保存失败')
    } finally {
      setIncSaving(false)
    }
  }

  const openAddPipeline = () => {
    setPipeEditId(null)
    setPipeForm(emptyPipeline())
    setPipeOpen(true)
  }

  const openEditPipeline = (p: CicdPipeline) => {
    setPipeEditId(p.id)
    setPipeForm({ name: p.name, stage: p.stage, status: p.status })
    setPipeOpen(true)
  }

  const createPipeline = async () => {
    setPipeSaving(true)
    setError('')
    try {
      const payload = { name: pipeForm.name, stage: pipeForm.stage, status: pipeForm.status }
      if (pipeEditId) await api.automation.patchPipeline(pipeEditId, payload)
      else await api.automation.createPipeline(payload)
      setPipeOpen(false)
      setPipeForm(emptyPipeline())
      load()
    } catch (e) {
      setError((e as Error).message || '保存失败')
    } finally {
      setPipeSaving(false)
    }
  }

  const runPipeline = async (p: CicdPipeline) => {
    setRunningId(p.id)
    setError('')
    try {
      // 台账模拟触发：流水线尚未接真实 CI/CD 引擎，此处仅记录运行状态与时间。
      // 真实接入（GitHub/GitLab Webhook）后替换为实际触发 + 状态回写。
      await api.automation.patchPipeline(p.id, {
        status: 'success',
        lastRunAt: new Date().toISOString(),
        stage: p.stage,
      })
      load()
    } catch (e) {
      setError((e as Error).message || '触发失败')
    } finally {
      setRunningId('')
    }
  }

  const removePipeline = async (id: string) => {
    setConfirmDelete(null)
    setError('')
    try {
      await api.automation.removePipeline(id)
      load()
    } catch (e) {
      setError((e as Error).message || '删除失败')
    }
  }

  if (loading && incidents.length === 0 && cicd.length === 0) {
    return (
      <Box display="flex" justifyContent="center" py={10}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box>
      <PageHeader
        title="流程自动化"
        subtitle="事故管理（创建 / 跟踪 / 复盘）+ CI/CD 流水线台账"
        actions={
          <>
            <Button
              variant="outlined"
              startIcon={<AccountTree />}
              onClick={openAddPipeline}
            >
              添加流水线
            </Button>
            <Button
              variant="contained"
              startIcon={<IconAdd />}
              onClick={openAddIncident}
            >
              新建事故
            </Button>
          </>
        }
      />

      {error && (
        <MuiAlert severity="error" sx={{ mb: 2 }}>
          {error}
        </MuiAlert>
      )}

      <Grid container spacing={2}>
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                <BugReport sx={{ color: theme.palette.primary.main }} />
                <Typography variant="subtitle1">事故管理</Typography>
              </Stack>
              <Divider sx={{ mb: 1.5 }} />
              {incidents.length === 0 ? (
                <EmptyState text="暂无事故，点击「新建事故」创建" icon={<BugReport />} />
              ) : (
                <Stack spacing={1.5}>
                  {incidents.map((inc) => (
                    <Box
                      key={inc.id}
                      sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 2 }}
                    >
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {inc.title}
                        </Typography>
                        <Stack direction="row" spacing={0.5}>
                          <StatusBadge status={levelStatus(inc.level as AlertLevel)} label={inc.level} />
                          <StatusBadge status={incidentStatus(inc.state)} label={STATE_LABEL[inc.state]} />
                        </Stack>
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {inc.assignee ? `负责人：${inc.assignee} · ` : ''}
                        更新：{new Date(inc.updatedAt).toLocaleString()}
                      </Typography>
                      <Stack direction="row" spacing={0.5} mt={1}>
                        {inc.state !== 'postmortem' && (
                          <Tooltip title="推进到下一状态">
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<IconFlow />}
                              onClick={() => flowIncident(inc)}
                            >
                              流转变更
                            </Button>
                          </Tooltip>
                        )}
                        <Tooltip title="编辑事故">
                          <IconButton size="small" onClick={() => openEditIncident(inc)}>
                            <EditOutlined fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="删除事故">
                          <IconButton size="small" color="error" onClick={() => setConfirmDelete({ kind: 'incident', id: inc.id, name: inc.title })}>
                            <IconDelete fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={5}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                <AccountTree sx={{ color: theme.palette.primary.main }} />
                <Typography variant="subtitle1">CI/CD 流水线</Typography>
              </Stack>
              <Divider sx={{ mb: 1.5 }} />
              {cicd.length === 0 ? (
                <EmptyState text="暂无流水线，点击「添加流水线」录入" icon={<AccountTree />} />
              ) : (
                <Stack spacing={1.5}>
                  {cicd.map((p) => (
                    <Box
                      key={p.id}
                      sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 2 }}
                    >
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {p.name}
                        </Typography>
                        <StatusBadge status={cicdStatus(p.status)} label={CICD_LABEL[p.status] ?? p.status} />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        阶段：{CICD_STAGES.find((s) => s.value === p.stage)?.label ?? p.stage}
                        {p.lastRunAt
                          ? ` · ${new Date(p.lastRunAt).toLocaleString()}`
                          : ''}
                      </Typography>
                      <Stack direction="row" spacing={0.5} mt={1}>
                        <Tooltip title="记录一次运行（台账模式：写入状态与时间，暂未接入真实 CI/CD 引擎）">
                          <IconButton
                            size="small"
                            color="primary"
                            disabled={runningId === p.id}
                            onClick={() => runPipeline(p)}
                          >
                            {runningId === p.id ? <CircularProgress size={16} /> : <IconRun fontSize="small" />}
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="编辑流水线">
                          <IconButton size="small" onClick={() => openEditPipeline(p)}>
                            <EditOutlined fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="删除流水线">
                          <IconButton size="small" color="error" onClick={() => setConfirmDelete({ kind: 'pipeline', id: p.id, name: p.name })}>
                            <IconDelete fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* 新建 / 编辑事故 */}
      <Dialog open={incOpen} onClose={() => setIncOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{incEditId ? '编辑事故' : '新建事故'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {error && <MuiAlert severity="error" onClose={() => setError('')}>{error}</MuiAlert>}
            <TextField
              label="标题"
              fullWidth
              value={incForm.title}
              onChange={(e) => setIncForm((f) => ({ ...f, title: e.target.value }))}
            />
            <TextField
              label="级别"
              select
              fullWidth
              value={incForm.level}
              onChange={(e) => setIncForm((f) => ({ ...f, level: e.target.value as AlertLevel }))}
            >
              <MenuItem value="P0">P0</MenuItem>
              <MenuItem value="P1">P1</MenuItem>
              <MenuItem value="P2">P2</MenuItem>
              <MenuItem value="P3">P3</MenuItem>
            </TextField>
            <TextField
              label="负责人（可选）"
              fullWidth
              value={incForm.assignee}
              onChange={(e) => setIncForm((f) => ({ ...f, assignee: e.target.value }))}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIncOpen(false)}>取消</Button>
          <Button variant="contained" disabled={incSaving || !incForm.title.trim()} onClick={createIncident}>
            {incSaving ? '保存中…' : incEditId ? '保存' : '创建'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 添加 / 编辑流水线 */}
      <Dialog open={pipeOpen} onClose={() => setPipeOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{pipeEditId ? '编辑流水线' : '添加流水线'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {error && <MuiAlert severity="error" onClose={() => setError('')}>{error}</MuiAlert>}
            <TextField
              label="名称"
              fullWidth
              value={pipeForm.name}
              onChange={(e) => setPipeForm((f) => ({ ...f, name: e.target.value }))}
            />
            <TextField
              label="阶段"
              select
              fullWidth
              value={pipeForm.stage}
              onChange={(e) => setPipeForm((f) => ({ ...f, stage: e.target.value }))}
            >
              {CICD_STAGES.map((s) => (
                <MenuItem key={s.value} value={s.value}>
                  {s.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="初始状态"
              select
              fullWidth
              value={pipeForm.status}
              onChange={(e) => setPipeForm((f) => ({ ...f, status: e.target.value as CicdPipeline['status'] }))}
            >
              <MenuItem value="pending">待运行</MenuItem>
              <MenuItem value="success">成功</MenuItem>
              <MenuItem value="failed">失败</MenuItem>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPipeOpen(false)}>取消</Button>
          <Button variant="contained" disabled={pipeSaving || !pipeForm.name.trim()} onClick={createPipeline}>
            {pipeSaving ? '保存中…' : pipeEditId ? '保存' : '创建'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 删除确认（事故 / 流水线共用） */}
      <ConfirmDialog
        open={!!confirmDelete}
        title={confirmDelete?.kind === 'incident' ? '删除事故' : '删除流水线'}
        content={<>确定删除「{confirmDelete?.name}」吗？此操作不可恢复。</>}
        onConfirm={() => {
          if (!confirmDelete) return
          if (confirmDelete.kind === 'incident') void removeIncident(confirmDelete.id)
          else void removePipeline(confirmDelete.id)
        }}
        onClose={() => setConfirmDelete(null)}
      />
    </Box>
  )
}