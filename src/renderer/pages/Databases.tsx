import { useEffect, useState } from 'react'
import {
  Box,
  Typography,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Chip,
  Stack,
  Alert,
  Grid,
  Tooltip,
  CircularProgress,
} from '@mui/material'
import { useTheme, type Theme } from '@mui/material/styles'
import {
  Add as IconAdd,
  Delete as IconDelete,
  Edit as IconEdit,
  MonitorHeart as IconHealth,
  Refresh as IconRefresh,
  SmartToy as IconAi,
} from '@mui/icons-material'
import { api } from '../../capabilities/bus'
import type { DbConnection, DbHealth, DbType, Status } from '@shared/types'
import DataTable, { type Column } from '../components/DataTable'
import PageHeader from '../components/PageHeader'
import AiDialog from '../components/AiDialog'

function statusColor(theme: Theme, s: Status): string {
  if (s === 'ok') return theme.palette.success.main
  if (s === 'warn') return theme.palette.warning.main
  if (s === 'error') return theme.palette.error.main
  return theme.palette.text.secondary
}

function MetricChip({ name, value, status }: { name: string; value: string; status: Status }) {
  const theme = useTheme()
  return (
    <Chip
      size="small"
      variant="outlined"
      label={`${name}: ${value}`}
      sx={{ mr: 0.5, mb: 0.5, borderColor: statusColor(theme, status), color: statusColor(theme, status) }}
    />
  )
}

export default function Databases() {
  const theme = useTheme()
  const [conns, setConns] = useState<DbConnection[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [health, setHealth] = useState<DbHealth | null>(null)
  const [healthOpen, setHealthOpen] = useState(false)
  const [aiCtx, setAiCtx] = useState<{ title: string; payload: Record<string, unknown> } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmDeleteName, setConfirmDeleteName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const [form, setForm] = useState<{
    name: string
    dbType: DbType
    host: string
    port: number
    database: string
    username: string
    password: string
  }>({ name: '', dbType: 'mysql', host: '', port: 3306, database: '', username: '', password: '' })

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const c = await api.db.list()
      setConns(c)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function onHealth(conn: DbConnection) {
    setError(null)
    try {
      const h = await api.db.health(conn.id)
      setHealth(h)
      setHealthOpen(true)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function askDelete(id: string, name: string) {
    setConfirmDeleteId(id)
    setConfirmDeleteName(name)
  }

  async function doDelete() {
    if (!confirmDeleteId) return
    try {
      await api.db.remove(confirmDeleteId)
      setConfirmDeleteId(null)
      await load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function openCreate() {
    setEditingId(null)
    setForm({ name: '', dbType: 'mysql', host: '', port: 3306, database: '', username: '', password: '' })
    setOpen(true)
  }

  function openEdit(conn: DbConnection) {
    setEditingId(conn.id)
    setForm({ name: conn.name, dbType: conn.dbType, host: conn.host, port: conn.port, database: conn.database || '', username: conn.username || '', password: '' })
    setOpen(true)
  }

  function onTypeChange(t: DbType) {
    setForm((f) => ({ ...f, dbType: t, port: t === 'mysql' ? 3306 : t === 'postgres' ? 5432 : 6379 }))
  }

  async function onSubmit() {
    setSubmitting(true)
    setError(null)
    let newlyCreatedCredId: string | undefined
    // 端口防呆：清空输入会得到 NaN/0，直接拦在表单层
    const port = Number(form.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setError('端口需为 1-65535 的整数')
      setSubmitting(false)
      return
    }
    try {
      let credentialId: string | undefined = editingId
        ? conns.find((c) => c.id === editingId)?.credentialId
        : undefined
      if (form.password) {
        const cred = await api.credentials.create({
          name: `${form.name} 凭据`,
          kind: 'db',
          host: form.host,
          username: form.username,
          dbType: form.dbType,
          password: form.password,
        })
        credentialId = cred.id
        newlyCreatedCredId = cred.id
      }
      const payload = {
        name: form.name,
        dbType: form.dbType,
        host: form.host,
        port,
        database: form.database || undefined,
        username: form.username || undefined,
        credentialId,
      }
      if (editingId) await api.db.update(editingId, payload)
      else await api.db.create(payload)
      setOpen(false)
      setEditingId(null)
      setForm({ name: '', dbType: 'mysql', host: '', port: 3306, database: '', username: '', password: '' })
      await load()
    } catch (e) {
      // 编辑态未新建凭据时才需要回收（编辑态沿用旧凭据，不能删）
      if (newlyCreatedCredId) await api.credentials.remove(newlyCreatedCredId).catch(() => {})
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const columns: Column<DbConnection>[] = [
    { key: 'name', label: '名称', render: (c) => <Typography variant="body2" sx={{ fontWeight: 600 }}>{c.name}</Typography> },
    { key: 'dbType', label: '类型', render: (c) => <Chip size="small" label={c.dbType} /> },
    { key: 'host', label: '地址', render: (c) => <Typography variant="body2" sx={{ fontFamily: 'var(--font-mono)' }}>{c.host}:{c.port}</Typography> },
    { key: 'database', label: '数据库', render: (c) => c.database || '-' },
    { key: 'credentialId', label: '凭据', render: (c) => c.credentialId ? '已关联' : '无' },
    {
      key: '__actions',
      label: '操作',
      render: (c) => (
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Tooltip title="健康检查">
            <IconButton size="small" onClick={() => void onHealth(c)}>
              <IconHealth fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="编辑连接">
            <IconButton size="small" onClick={() => openEdit(c)}>
              <IconEdit fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="删除">
            <IconButton size="small" onClick={() => askDelete(c.id, c.name)}>
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
        title="数据库监控"
        subtitle="纳管 MySQL / PostgreSQL / Redis，实时探测连通性与关键指标"
        actions={
          <Stack direction="row" spacing={1}>
            <Button startIcon={<IconRefresh />} onClick={() => void load()} color="inherit">
              刷新
            </Button>
            <Button variant="contained" startIcon={<IconAdd />} onClick={openCreate}>
              添加连接
            </Button>
          </Stack>
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress size={28} />
        </Box>
      ) : (
        <DataTable
          columns={columns}
          rows={conns}
          emptyText="暂无数据库连接，点击「添加连接」开始纳管。"
        />
      )}

      {/* 添加连接 */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingId ? '编辑数据库连接' : '添加数据库连接'}</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mt: 1, mb: 1 }}>
              {error}
            </Alert>
          )}
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={6}>
              <TextField label="名称" fullWidth size="small" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="类型" select fullWidth size="small" value={form.dbType} onChange={(e) => onTypeChange(e.target.value as DbType)}>
                <MenuItem value="mysql">MySQL</MenuItem>
                <MenuItem value="postgres">PostgreSQL</MenuItem>
                <MenuItem value="redis">Redis</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="主机" fullWidth size="small" value={form.host} onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="端口" type="number" fullWidth size="small" value={form.port} onChange={(e) => setForm((f) => ({ ...f, port: Number(e.target.value) }))} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="数据库名（可选）" fullWidth size="small" value={form.database} onChange={(e) => setForm((f) => ({ ...f, database: e.target.value }))} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="用户名（可选）" fullWidth size="small" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label={editingId ? '密码（留空保持原凭据）' : '密码'}
                type="password"
                fullWidth
                size="small"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>取消</Button>
          <Button variant="contained" disabled={submitting || !form.name.trim() || !form.host.trim()} onClick={() => void onSubmit()}>
            {submitting ? '保存中…' : '保存'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 健康详情 */}
      <Dialog open={healthOpen} onClose={() => setHealthOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>健康检查结果</DialogTitle>
        <DialogContent>
          {health && (
            <Stack spacing={1.5} sx={{ mt: 1 }}>
              <Box>
                <Chip
                  size="small"
                  label={health.connected ? '已连通' : '不可达'}
                  sx={{
                    bgcolor: health.connected ? theme.palette.success.main : theme.palette.error.main,
                    color: '#fff',
                  }}
                />
                {health.version && (
                  <Typography component="span" sx={{ ml: 1, color: theme.palette.text.secondary }}>
                    版本 {health.version}
                  </Typography>
                )}
              </Box>
              {health.error && (
                <Alert severity="error">{health.error}</Alert>
              )}
              <Box>
                {health.metrics.map((m, i) => (
                  <MetricChip key={i} name={m.name} value={m.value} status={m.status} />
                ))}
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            startIcon={<IconAi />}
            disabled={!health}
            onClick={() => health && setAiCtx({
              title: `AI 分析：${conns.find((c) => c.id === health.connectionId)?.name || ''}`,
              payload: {
                数据库: health.connectionId,
                连通: health.connected,
                版本: health.version,
                指标: (health.metrics || []).map((m) => `${m.name}=${m.value}`).join(', '),
                错误: health.error,
              },
            })}
          >
            AI 分析
          </Button>
          <Button onClick={() => setHealthOpen(false)}>关闭</Button>
        </DialogActions>
      </Dialog>

      {/* 删除确认 */}
      <Dialog open={!!confirmDeleteId} onClose={() => setConfirmDeleteId(null)} maxWidth="xs" fullWidth>
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          确定要删除数据库连接「{confirmDeleteName}」吗？此操作不可撤销。
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteId(null)}>取消</Button>
          <Button color="error" variant="contained" onClick={() => void doDelete()}>删除</Button>
        </DialogActions>
      </Dialog>

      {/* AI 分析 */}
      <AiDialog
        open={!!aiCtx}
        title={aiCtx?.title ?? ''}
        context={aiCtx ? { kind: 'resource', payload: aiCtx.payload } : null}
        onClose={() => setAiCtx(null)}
      />
    </Box>
  )
}
