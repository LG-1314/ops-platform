import { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Paper,
  Typography,
  Button,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
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
  CircularProgress,
  Tooltip,
} from '@mui/material'
import { useTheme, type Theme } from '@mui/material/styles'
import {
  Add as IconAdd,
  Delete as IconDelete,
  MonitorHeart as IconHealth,
  Refresh as IconRefresh,
} from '@mui/icons-material'
import { api } from '../../capabilities/bus'
import type { DbConnection, DbHealth, DbType, Credential, Status } from '@shared/types'

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
  const [creds, setCreds] = useState<Credential[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [health, setHealth] = useState<DbHealth | null>(null)
  const [healthOpen, setHealthOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState<{
    name: string
    dbType: DbType
    host: string
    port: number
    database: string
    username: string
    password: string
  }>({ name: '', dbType: 'mysql', host: '', port: 3306, database: '', username: '', password: '' })

  const dbCreds = useMemo(() => creds.filter((c) => c.kind === 'db'), [creds])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [c, cr] = await Promise.all([api.db.list(), api.credentials.list()])
      setConns(c)
      setCreds(cr)
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

  async function onDelete(id: string) {
    try {
      await api.db.remove(id)
      await load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function onTypeChange(t: DbType) {
    setForm((f) => ({ ...f, dbType: t, port: t === 'mysql' ? 3306 : t === 'postgres' ? 5432 : 6379 }))
  }

  async function onSubmit() {
    setSubmitting(true)
    setError(null)
    try {
      let credentialId: string | undefined
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
      }
      await api.db.create({
        name: form.name,
        dbType: form.dbType,
        host: form.host,
        port: form.port,
        database: form.database || undefined,
        username: form.username || undefined,
        credentialId,
      })
      setOpen(false)
      setForm({ name: '', dbType: 'mysql', host: '', port: 3306, database: '', username: '', password: '' })
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            数据库监控
          </Typography>
          <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
            纳管 MySQL / PostgreSQL / Redis，实时探测连通性与关键指标
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button startIcon={<IconRefresh />} onClick={() => void load()} color="inherit">
            刷新
          </Button>
          <Button variant="contained" startIcon={<IconAdd />} onClick={() => setOpen(true)}>
            添加连接
          </Button>
        </Stack>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ p: 0, overflow: 'hidden' }}>
        {loading ? (
          <Box display="flex" justifyContent="center" py={6}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>名称</TableCell>
                <TableCell>类型</TableCell>
                <TableCell>地址</TableCell>
                <TableCell>数据库</TableCell>
                <TableCell>凭据</TableCell>
                <TableCell align="right">操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {conns.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} sx={{ color: theme.palette.text.secondary }}>
                    暂无数据库连接，点击「添加连接」开始纳管。
                  </TableCell>
                </TableRow>
              )}
              {conns.map((c) => (
                <TableRow key={c.id}>
                  <TableCell sx={{ fontWeight: 600 }}>{c.name}</TableCell>
                  <TableCell>
                    <Chip size="small" label={c.dbType} />
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace' }}>
                    {c.host}:{c.port}
                  </TableCell>
                  <TableCell>{c.database || '-'}</TableCell>
                  <TableCell>{c.credentialId ? '已关联' : '无'}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="健康检查">
                      <IconButton size="small" onClick={() => void onHealth(c)}>
                        <IconHealth fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="删除">
                      <IconButton size="small" onClick={() => void onDelete(c.id)}>
                        <IconDelete fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>

      {/* 添加连接 */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>添加数据库连接</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="名称"
              fullWidth
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <TextField
              label="类型"
              select
              fullWidth
              value={form.dbType}
              onChange={(e) => onTypeChange(e.target.value as DbType)}
            >
              <MenuItem value="mysql">MySQL</MenuItem>
              <MenuItem value="postgres">PostgreSQL</MenuItem>
              <MenuItem value="redis">Redis</MenuItem>
            </TextField>
            <TextField
              label="主机"
              fullWidth
              value={form.host}
              onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
            />
            <TextField
              label="端口"
              type="number"
              fullWidth
              value={form.port}
              onChange={(e) => setForm((f) => ({ ...f, port: Number(e.target.value) }))}
            />
            <TextField
              label="数据库名（可选）"
              fullWidth
              value={form.database}
              onChange={(e) => setForm((f) => ({ ...f, database: e.target.value }))}
            />
            <TextField
              label="用户名（可选）"
              fullWidth
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            />
            <TextField
              label="密码"
              type="password"
              fullWidth
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>取消</Button>
          <Button variant="contained" disabled={submitting || !form.name || !form.host} onClick={() => void onSubmit()}>
            保存
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
          <Button onClick={() => setHealthOpen(false)}>关闭</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
