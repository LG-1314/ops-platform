import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
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
  LinearProgress,
  Divider,
} from '@mui/material'
import { useTheme, type Theme } from '@mui/material/styles'
import {
  Add as IconAdd,
  Delete as IconDelete,
  Refresh as IconRefresh,
  MonitorHeart as IconCollect,
  Terminal as IconTerminal,
  Computer as IconHost,
  ShowChart as IconTrend,
} from '@mui/icons-material'
import { api } from '../../capabilities/bus'
import type { Asset, HostMetricSample, Status } from '@shared/types'
import HostTrendDrawer from '../components/HostTrendDrawer'
import type { MonitorSummary } from '../../capabilities/bus'

function statusColor(theme: Theme, s: Status): string {
  if (s === 'ok') return theme.palette.success.main
  if (s === 'warn') return theme.palette.warning.main
  if (s === 'error') return theme.palette.error.main
  return theme.palette.text.secondary
}

function MetricBar({ label, pct, theme }: { label: string; pct: number; theme: Theme }) {
  const color = pct >= 90 ? theme.palette.error.main : pct >= 75 ? theme.palette.warning.main : theme.palette.success.main
  return (
    <Box sx={{ mb: 1.5 }}>
      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Typography variant="body2">{label}</Typography>
        <Typography variant="body2" sx={{ fontFamily: 'monospace', color }}>
          {pct}%
        </Typography>
      </Stack>
      <LinearProgress variant="determinate" value={pct} sx={{ height: 6, borderRadius: 3, '& .MuiLinearProgress-bar': { backgroundColor: color } }} />
    </Box>
  )
}

/** 表格内紧凑指标条（实时指标列用） */
function MiniBar({ label, pct, theme }: { label: string; pct?: number; theme: Theme }) {
  if (pct == null) return null
  const color = pct >= 90 ? theme.palette.error.main : pct >= 75 ? theme.palette.warning.main : theme.palette.success.main
  return (
    <Stack direction="row" alignItems="center" spacing={0.6} sx={{ minWidth: 96 }}>
      <Typography variant="caption" color="text.secondary" sx={{ width: 34, fontSize: 10, flexShrink: 0 }}>{label}</Typography>
      <LinearProgress variant="determinate" value={pct} sx={{ flex: 1, height: 4, borderRadius: 2, '& .MuiLinearProgress-bar': { backgroundColor: color } }} />
      <Typography variant="caption" sx={{ width: 34, fontSize: 10, fontFamily: 'monospace', color, textAlign: 'right', flexShrink: 0 }}>{pct}%</Typography>
    </Stack>
  )
}

export default function Hosts() {
  const theme = useTheme()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [hosts, setHosts] = useState<Asset[]>([])
  const [metrics, setMetrics] = useState<MonitorSummary['hosts']>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [sample, setSample] = useState<HostMetricSample | null>(null)
  const [sampleOpen, setSampleOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [collectingId, setCollectingId] = useState('')
  const [collectingAll, setCollectingAll] = useState(false)
  const [trendAsset, setTrendAsset] = useState<Asset | null>(null)

  // 来自监控大盘「趋势」快捷入口：?trendId=xxx 自动打开趋势抽屉
  useEffect(() => {
    const trendId = searchParams.get('trendId')
    if (!trendId) return
    const target = hosts.find((h) => h.id === trendId)
    if (target) {
      setTrendAsset(target)
      setSearchParams((prev) => { const n = new URLSearchParams(prev); n.delete('trendId'); return n }, { replace: true })
    }
  }, [searchParams, hosts, setSearchParams])

  const [form, setForm] = useState<{
    name: string
    host: string
    port: number
    authMethod: 'password' | 'privateKey'
    username: string
    password: string
    privateKey: string
  }>({ name: '', host: '', port: 22, authMethod: 'password', username: '', password: '', privateKey: '' })

  // 最新指标按资产 id 索引（来自 monitor/summary 单接口，避免逐台请求）
  const metricMap = useMemo(() => new Map(metrics.map((m) => [m.id, m])), [metrics])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [h, mon] = await Promise.all([
        api.assets.list(undefined, 'server'),
        api.monitor.summary(),
      ])
      setHosts(h)
      setMetrics(mon.hosts)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function onCollect(host: Asset) {
    setError(null)
    setCollectingId(host.id)
    try {
      const s = await api.ssh.collect({ host: host.host, port: host.port, credentialId: host.credentialId, assetId: host.id })
      setSample(s)
      setSampleOpen(true)
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCollectingId('')
    }
  }

  /** 批量采集全部关联了凭据的主机（串行，失败单台不中断） */
  async function onCollectAll() {
    const targets = hosts.filter((h) => h.credentialId)
    if (targets.length === 0) {
      setError('暂无关联 SSH 凭据的主机，请先为主机配置凭据')
      return
    }
    setCollectingAll(true)
    setError(null)
    try {
      for (const h of targets) {
        try {
          await api.ssh.collect({ host: h.host, port: h.port, credentialId: h.credentialId, assetId: h.id })
        } catch {
          /* 单台失败继续 */
        }
      }
      await load()
    } finally {
      setCollectingAll(false)
    }
  }

  async function onDelete(id: string) {
    try {
      await api.assets.remove(id)
      await load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function goTerminal(host: Asset) {
    const q = new URLSearchParams({
      host: host.host,
      port: String(host.port ?? 22),
      name: host.name,
    })
    if (host.credentialId) q.set('credentialId', host.credentialId)
    navigate(`/terminal?${q.toString()}`)
  }

  async function onSubmit() {
    setSubmitting(true)
    setError(null)
    try {
      let credentialId: string | undefined
      if (form.username && (form.password || form.privateKey)) {
        const cred = await api.credentials.create({
          name: `${form.name || form.host} SSH 凭据`,
          kind: 'ssh',
          host: form.host,
          username: form.username,
          password: form.authMethod === 'password' ? form.password : undefined,
          privateKey: form.authMethod === 'privateKey' ? form.privateKey : undefined,
        })
        credentialId = cred.id
      }
      await api.assets.create({
        name: form.name || form.host,
        type: 'server',
        host: form.host,
        port: form.port,
        source: 'ssh',
        tags: ['ssh'],
        credentialId,
      })
      setOpen(false)
      setForm({ name: '', host: '', port: 22, authMethod: 'password', username: '', password: '', privateKey: '' })
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
            主机监控
          </Typography>
          <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
            添加主机并经由 SSH 采集 CPU / 内存 / 磁盘 / 负载指标，一键进入终端
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button startIcon={<IconRefresh />} onClick={() => void load()} color="inherit">
            刷新
          </Button>
          <Button
            startIcon={collectingAll ? <CircularProgress size={16} /> : <IconCollect />}
            onClick={() => void onCollectAll()}
            disabled={collectingAll}
            color="inherit"
          >
            {collectingAll ? '采集中…' : '采集全部'}
          </Button>
          <Button variant="contained" startIcon={<IconAdd />} onClick={() => setOpen(true)}>
            添加主机
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
                <TableCell>地址</TableCell>
                <TableCell>实时指标</TableCell>
                <TableCell>凭据</TableCell>
                <TableCell>状态</TableCell>
                <TableCell align="right">操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {hosts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} sx={{ color: theme.palette.text.secondary }}>
                    暂无主机，点击「添加主机」开始纳管。
                  </TableCell>
                </TableRow>
              )}
              {hosts.map((h) => {
                const m = metricMap.get(h.id)
                return (
                  <TableRow key={h.id}>
                    <TableCell sx={{ fontWeight: 600 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <IconHost fontSize="small" sx={{ color: theme.palette.primary.main }} />
                        {h.name}
                      </Box>
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace' }}>
                      {h.host}:{h.port ?? 22}
                    </TableCell>
                    <TableCell sx={{ py: 0.5 }}>
                      {m ? (
                        <Stack spacing={0.4}>
                          <MiniBar label="CPU" pct={m.cpuPct} theme={theme} />
                          <MiniBar label="内存" pct={m.memPct} theme={theme} />
                          <MiniBar label="磁盘" pct={m.diskPct} theme={theme} />
                        </Stack>
                      ) : (
                        <Typography variant="caption" color="text.secondary">未采集</Typography>
                      )}
                    </TableCell>
                    <TableCell>{h.credentialId ? '已关联' : '无'}</TableCell>
                    <TableCell>
                      <StatusBadgeInline s={h.reachable ? 'ok' : h.reachable === false ? 'error' : 'unknown'} label={h.reachable ? '在线' : h.reachable === false ? '离线' : '未探测'} theme={theme} />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="趋势">
                        <IconButton size="small" onClick={() => setTrendAsset(h)}>
                          <IconTrend fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="采集指标">
                        <IconButton size="small" onClick={() => void onCollect(h)} disabled={collectingId === h.id}>
                          {collectingId === h.id ? <CircularProgress size={16} /> : <IconCollect fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="终端">
                        <IconButton size="small" onClick={() => goTerminal(h)}>
                          <IconTerminal fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="删除">
                        <IconButton size="small" onClick={() => void onDelete(h.id)}>
                          <IconDelete fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Paper>

      {/* 添加主机 */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>添加主机</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="名称"
              fullWidth
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <TextField
              label="主机地址"
              fullWidth
              value={form.host}
              onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
              placeholder="192.168.1.10 或 hostname"
            />
            <TextField
              label="SSH 端口"
              type="number"
              fullWidth
              value={form.port}
              onChange={(e) => setForm((f) => ({ ...f, port: Number(e.target.value) }))}
            />
            <TextField
              label="用户名"
              fullWidth
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            />
            <TextField
              label="认证方式"
              select
              fullWidth
              value={form.authMethod}
              onChange={(e) => setForm((f) => ({ ...f, authMethod: e.target.value as 'password' | 'privateKey' }))}
            >
              <MenuItem value="password">密码</MenuItem>
              <MenuItem value="privateKey">私钥</MenuItem>
            </TextField>
            {form.authMethod === 'password' ? (
              <TextField
                label="密码"
                type="password"
                fullWidth
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              />
            ) : (
              <TextField
                label="私钥 (PEM)"
                multiline
                minRows={4}
                fullWidth
                value={form.privateKey}
                onChange={(e) => setForm((f) => ({ ...f, privateKey: e.target.value }))}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>取消</Button>
          <Button
            variant="contained"
            disabled={submitting || !form.host}
            onClick={() => void onSubmit()}
          >
            保存
          </Button>
        </DialogActions>
      </Dialog>

      {/* 趋势抽屉 */}
      <HostTrendDrawer open={!!trendAsset} asset={trendAsset} onClose={() => setTrendAsset(null)} />

      {/* 指标详情 */}
      <Dialog open={sampleOpen} onClose={() => setSampleOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>主机指标</DialogTitle>
        <DialogContent>
          {sample && (
            <Stack spacing={1.5} sx={{ mt: 1 }}>
              <Box>
                <Chip
                  size="small"
                  label={sample.status === 'ok' ? '采集成功' : '异常'}
                  sx={{
                    bgcolor: sample.status === 'ok' ? theme.palette.success.main : theme.palette.error.main,
                    color: '#fff',
                  }}
                />
                {sample.hostname && (
                  <Typography component="span" sx={{ ml: 1, color: theme.palette.text.secondary, fontFamily: 'monospace' }}>
                    {sample.hostname}
                  </Typography>
                )}
              </Box>
              {sample.uptime && (
                <Typography variant="body2">运行时长：{sample.uptime}</Typography>
              )}
              <Divider />
              {typeof sample.cpuIdle === 'number' && (
                <MetricBar label="CPU 使用率" pct={Math.max(0, Math.round(100 - sample.cpuIdle))} theme={theme} />
              )}
              {sample.memTotalMb && sample.memUsedMb != null ? (
                <MetricBar
                  label={`内存使用率 (${sample.memUsedMb}/${sample.memTotalMb} MB)`}
                  pct={Math.round((sample.memUsedMb / sample.memTotalMb) * 100)}
                  theme={theme}
                />
              ) : null}
              <Typography variant="body2" sx={{ mt: 1 }}>
                负载：{sample.load1 ?? '-'} / {sample.load5 ?? '-'} / {sample.load15 ?? '-'}
              </Typography>
              <Divider />
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                磁盘
              </Typography>
              {sample.disk.map((d, i) => (
                <MetricBar key={i} label={`${d.mount} (${d.usedGb}/${d.totalGb} GB)`} pct={d.usedPct} theme={theme} />
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSampleOpen(false)}>关闭</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

function StatusBadgeInline({ s, label, theme }: { s: Status; label: string; theme: Theme }) {
  return (
    <Chip
      size="small"
      label={label}
      sx={{ bgcolor: statusColor(theme, s) + '22', color: statusColor(theme, s), borderColor: statusColor(theme, s), border: '1px solid' }}
    />
  )
}
