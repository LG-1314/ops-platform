import { useEffect, useState } from 'react'
import {
  Box,
  Grid,
  Typography,
  Stack,
  Button,
  Card,
  CardContent,
  Divider,
  CircularProgress,
  Chip,
  Alert as MuiAlert,
  useTheme,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Switch,
  FormControlLabel,
  IconButton,
  Tooltip,
} from '@mui/material'
import {
  Add as IconAdd,
  PlayArrow as IconRun,
  Delete as IconDelete,
  Edit as IconEdit,
  FactCheck as IconCheck,
  ReportProblem as IconAbnormal,
  Healing as IconHeal,
  PlaylistPlay as IconRunAll,
  MedicalServices as IconService,
} from '@mui/icons-material'
import { api } from '../../capabilities/bus'
import type { ServiceCheck, Asset } from '@shared/types'
import PageHeader from '../components/PageHeader'
import KpiCard from '../components/KpiCard'
import DataTable, { Column } from '../components/DataTable'
import EmptyState from '../components/EmptyState'
import StatusBadge from '../components/StatusBadge'

const TYPE_LABEL: Record<ServiceCheck['checkType'], string> = {
  process: '进程',
  port: '端口',
  systemd: 'Systemd',
}

export default function ServiceChecks() {
  const theme = useTheme()
  const [checks, setChecks] = useState<ServiceCheck[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState<string | null>(null)
  const [runAllLoading, setRunAllLoading] = useState(false)
  const [error, setError] = useState('')

  // 新建 / 编辑
  const [open, setOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ServiceCheck | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    assetId: '',
    checkType: 'systemd' as ServiceCheck['checkType'],
    serviceName: '',
    port: '8080',
    expectAlive: true,
    autoHeal: false,
    enabled: true,
  })

  const load = () => {
    setLoading(true)
    setError('')
    Promise.all([api.serviceChecks.list(), api.assets.list()])
      .then(([c, a]) => {
        setChecks(c)
        setAssets(Array.isArray(a) ? a : [])
      })
      .catch((e) => setError((e as Error).message || '加载失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const assetName = (id: string) => assets.find((a) => a.id === id)?.name || id

  const openAdd = () => {
    setEditTarget(null)
    setForm({ name: '', assetId: '', checkType: 'systemd', serviceName: '', port: '8080', expectAlive: true, autoHeal: false, enabled: true })
    setOpen(true)
  }

  const openEdit = (c: ServiceCheck) => {
    setEditTarget(c)
    setForm({
      name: c.name,
      assetId: c.assetId,
      checkType: c.checkType,
      serviceName: c.serviceName,
      port: String(c.port || '8080'),
      expectAlive: c.expectAlive,
      autoHeal: c.autoHeal,
      enabled: c.enabled,
    })
    setOpen(true)
  }

  const onSave = async () => {
    if (!form.name.trim() || !form.assetId || !form.serviceName.trim()) {
      setError('名称 / 目标资产 / 服务名必填')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = {
        name: form.name.trim(),
        assetId: form.assetId,
        checkType: form.checkType,
        serviceName: form.serviceName.trim(),
        port: form.checkType === 'port' ? Number(form.port) : undefined,
        expectAlive: form.expectAlive,
        autoHeal: form.autoHeal,
        enabled: form.enabled,
      }
      if (editTarget) await api.serviceChecks.update(editTarget.id, payload)
      else await api.serviceChecks.create(payload)
      setOpen(false)
      load()
    } catch (e) {
      setError((e as Error).message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const onRun = async (c: ServiceCheck) => {
    setRunning(c.id)
    setError('')
    try {
      const updated = await api.serviceChecks.run(c.id)
      setChecks((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
    } catch (e) {
      setError((e as Error).message || '执行失败')
    } finally {
      setRunning(null)
    }
  }

  const onRunAll = async () => {
    setRunAllLoading(true)
    setError('')
    try {
      const updated = await api.serviceChecks.runAll()
      const map = new Map(updated.map((c) => [c.id, c]))
      setChecks((prev) => prev.map((x) => map.get(x.id) || x))
    } catch (e) {
      setError((e as Error).message || '批量执行失败')
    } finally {
      setRunAllLoading(false)
    }
  }

  const onToggle = async (c: ServiceCheck, enabled: boolean) => {
    setError('')
    try {
      const updated = await api.serviceChecks.update(c.id, { enabled })
      setChecks((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
    } catch (e) {
      setError((e as Error).message || '启停失败')
    }
  }

  const onDelete = async (c: ServiceCheck) => {
    if (!window.confirm(`确认删除检查项「${c.name}」？`)) return
    setError('')
    try {
      await api.serviceChecks.remove(c.id)
      setChecks((prev) => prev.filter((x) => x.id !== c.id))
    } catch (e) {
      setError((e as Error).message || '删除失败')
    }
  }

  const abnormal = checks.filter((c) => c.lastResult && c.lastResult.alive !== c.expectAlive)
  const healthy = checks.filter((c) => c.lastResult && c.lastResult.alive === c.expectAlive)
  const neverRun = checks.filter((c) => !c.lastResult)
  const healCount = checks.filter((c) => c.lastResult?.healed).length

  const cols: Column<ServiceCheck>[] = [
    { key: 'name', label: '名称' },
    {
      key: 'assetId',
      label: '目标资产',
      render: (r) => (
        <Stack direction="row" spacing={1} alignItems="center">
          <IconService fontSize="small" color="primary" />
          <Typography variant="body2">{assetName(r.assetId)}</Typography>
        </Stack>
      ),
    },
    { key: 'checkType', label: '类型', render: (r) => <Chip size="small" label={TYPE_LABEL[r.checkType]} variant="outlined" /> },
    {
      key: 'serviceName',
      label: '检测目标',
      render: (r) => (
        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
          {r.checkType === 'port' ? `${assetName(r.assetId)}:${r.port}` : r.serviceName}
        </Typography>
      ),
    },
    {
      key: 'lastResult',
      label: '最近结果',
      render: (r) => {
        if (!r.lastResult) return <Typography variant="body2" color="text.secondary">未执行</Typography>
        const ok = r.lastResult.alive === r.expectAlive
        return (
          <Stack spacing={0.5}>
            <StatusBadge status={ok ? 'ok' : 'error'} label={r.lastResult.alive ? '存活' : '异常'} />
            <Typography variant="caption" color="text.secondary">
              {new Date(r.lastResult.checkedAt).toLocaleString('zh-CN', { hour12: false })}
            </Typography>
            {r.lastResult.healed && (
              <Chip size="small" color="success" variant="outlined" label={`自愈${r.lastResult.healDetail?.includes('恢复') ? '成功' : '已执行'}`} />
            )}
          </Stack>
        )
      },
    },
    {
      key: 'autoHeal',
      label: '自愈',
      render: (r) => (r.autoHeal ? <Chip size="small" color="info" label="开启" /> : <Chip size="small" variant="outlined" label="关闭" />),
    },
    {
      key: 'enabled',
      label: '启用',
      render: (r) => (
        <Switch size="small" checked={r.enabled} onChange={(e) => onToggle(r, e.target.checked)} />
      ),
    },
    {
      key: 'ops',
      label: '操作',
      render: (r) => (
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="立即检查">
            <IconButton size="small" disabled={running === r.id} onClick={() => onRun(r)}>
              {running === r.id ? <CircularProgress size={16} /> : <IconRun fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Tooltip title="编辑">
            <IconButton size="small" onClick={() => openEdit(r)}>
              <IconEdit fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="删除">
            <IconButton size="small" onClick={() => onDelete(r)}>
              <IconDelete fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    },
  ]

  return (
    <Box>
      <PageHeader
        title="服务巡检"
        subtitle="进程 / 端口 / Systemd 服务存活检测，支持异常自动重启自愈"
        actions={
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              startIcon={runAllLoading ? <CircularProgress size={16} color="inherit" /> : <IconRunAll />}
              disabled={runAllLoading || checks.filter((c) => c.enabled).length === 0}
              onClick={onRunAll}
            >
              {runAllLoading ? '巡检中…' : '批量巡检'}
            </Button>
            <Button variant="contained" startIcon={<IconAdd />} onClick={openAdd}>
              新建检查项
            </Button>
          </Stack>
        }
      />

      {error && (
        <MuiAlert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </MuiAlert>
      )}

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={6} md={3}>
          <KpiCard title="检查项总数" value={checks.length} icon={<IconService />} />
        </Grid>
        <Grid item xs={6} md={3}>
          <KpiCard title="正常" value={healthy.length} icon={<IconCheck />} color={theme.palette.success.main} />
        </Grid>
        <Grid item xs={6} md={3}>
          <KpiCard title="异常" value={abnormal.length} icon={<IconAbnormal />} color={abnormal.length ? theme.palette.error.main : theme.palette.text.secondary} />
        </Grid>
        <Grid item xs={6} md={3}>
          <KpiCard title="自愈次数" value={healCount} icon={<IconHeal />} color={theme.palette.info.main} />
        </Grid>
      </Grid>

      {loading ? (
        <Box display="flex" justifyContent="center" py={10}>
          <CircularProgress />
        </Box>
      ) : checks.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              text="暂无服务检查项"
              description="创建进程 / 端口 / Systemd 检查，即可定时监控业务服务存活；异常时可自动重启自愈"
              icon={<IconService />}
              action={
                <Button variant="contained" startIcon={<IconAdd />} onClick={openAdd}>
                  新建检查项
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <Typography variant="subtitle1" gutterBottom>
              检查项列表{neverRun.length > 0 && `（${neverRun.length} 项尚未执行）`}
            </Typography>
            <Divider sx={{ mb: 1.5 }} />
            <DataTable columns={cols} rows={checks} emptyText="暂无检查项" />
          </CardContent>
        </Card>
      )}

      {/* 新建 / 编辑 */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editTarget ? '编辑检查项' : '新建服务检查项'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="检查项名称"
              fullWidth
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="如 nginx 存活检查"
            />
            <TextField
              label="目标资产"
              select
              fullWidth
              value={form.assetId}
              onChange={(e) => setForm((f) => ({ ...f, assetId: e.target.value }))}
            >
              {assets.map((a) => (
                <MenuItem key={a.id} value={a.id}>
                  {a.name}（{a.ip || a.host}）
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="检查类型"
              select
              fullWidth
              value={form.checkType}
              onChange={(e) => setForm((f) => ({ ...f, checkType: e.target.value as ServiceCheck['checkType'] }))}
            >
              <MenuItem value="systemd">Systemd 服务状态</MenuItem>
              <MenuItem value="process">进程存活（pgrep）</MenuItem>
              <MenuItem value="port">TCP 端口连通</MenuItem>
            </TextField>
            {form.checkType === 'port' ? (
              <TextField
                label="端口号"
                fullWidth
                value={form.port}
                onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
                placeholder="8080"
              />
            ) : (
              <TextField
                label={form.checkType === 'systemd' ? 'Systemd 服务名' : '进程名'}
                fullWidth
                value={form.serviceName}
                onChange={(e) => setForm((f) => ({ ...f, serviceName: e.target.value }))}
                placeholder={form.checkType === 'systemd' ? 'nginx' : 'nginx'}
                sx={{ fontFamily: 'monospace' }}
              />
            )}
            <Stack direction="row" spacing={2}>
              <FormControlLabel
                control={<Switch checked={form.expectAlive} onChange={(e) => setForm((f) => ({ ...f, expectAlive: e.target.checked }))} />}
                label="期望存活"
              />
              <FormControlLabel
                control={<Switch checked={form.autoHeal} onChange={(e) => setForm((f) => ({ ...f, autoHeal: e.target.checked }))} />}
                label="失败自动自愈（systemctl restart）"
              />
              <FormControlLabel
                control={<Switch checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} />}
                label="启用"
              />
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Systemd / 进程检查通过 SSH 执行，需目标资产已关联 SSH 凭据；端口检查无需凭据，直接 TCP 探测。
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>取消</Button>
          <Button variant="contained" disabled={saving} onClick={onSave}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
