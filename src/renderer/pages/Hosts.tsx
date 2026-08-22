import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
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
  SmartToy as IconAi,
  Dns as IconServices,
} from '@mui/icons-material'
import { api, ApiClientError } from '../../capabilities/bus'
import type { Asset, HostMetricSample, Status } from '@shared/types'
import HostTrendDrawer from '../components/HostTrendDrawer'
import TerminalDialog from '../components/TerminalDialog'
import AiDialog from '../components/AiDialog'
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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmDeleteName, setConfirmDeleteName] = useState('')
  const [trendAsset, setTrendAsset] = useState<Asset | null>(null)
  // 页内终端
  const [termHost, setTermHost] = useState<Asset | null>(null)
  // AI 诊断
  const [aiHost, setAiHost] = useState<Asset | null>(null)
  // 服务检查
  const [svcHost, setSvcHost] = useState<Asset | null>(null)
  const [svcList, setSvcList] = useState<{ name: string; status: string; description: string; active: boolean }[] | null>(null)
  const [svcLoading, setSvcLoading] = useState(false)
  const [svcError, setSvcError] = useState('')

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
      setError((e as Error).message || '加载主机列表失败')
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
      setError((e instanceof ApiClientError ? e.detail : null) || (e as Error).message || '采集指标失败')
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

  function askDelete(id: string, name: string) {
    setConfirmDeleteId(id)
    setConfirmDeleteName(name)
  }

  async function confirmDelete() {
    if (!confirmDeleteId) return
    setError(null)
    try {
      await api.assets.remove(confirmDeleteId)
      setConfirmDeleteId(null)
      await load()
    } catch (e) {
      setError((e as Error).message || '删除主机失败')
    }
  }

  function goTerminal(host: Asset) {
    // 页内弹窗打开终端，不跳转终端页签（保留原页操作状态）
    setTermHost(host)
  }

  /** 服务检查：经 SSH 采集目标主机运行中的 systemd 服务 */
  async function openServices(host: Asset) {
    if (!host.credentialId) {
      setError('该主机未配置 SSH 凭据，无法执行服务检查')
      return
    }
    setSvcHost(host)
    setSvcList(null)
    setSvcError('')
    setSvcLoading(true)
    try {
      const r = await api.sshServices.check({ host: host.host, port: host.port, credentialId: host.credentialId })
      setSvcList(r)
    } catch (e) {
      setSvcError((e instanceof ApiClientError ? e.detail : null) || (e as Error).message || '服务检查失败')
    } finally {
      setSvcLoading(false)
    }
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
                      <Tooltip title="AI 诊断建议">
                        <IconButton size="small" onClick={() => setAiHost(h)}>
                          <IconAi fontSize="small" color="primary" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="趋势">
                        <IconButton size="small" onClick={() => setTrendAsset(h)}>
                          <IconTrend fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={h.credentialId ? '采集指标' : '未配置 SSH 凭据'}>
                        <span>
                          <IconButton size="small" onClick={() => void onCollect(h)} disabled={collectingId === h.id || !h.credentialId}>
                            {collectingId === h.id ? <CircularProgress size={16} /> : <IconCollect fontSize="small" />}
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title={h.credentialId ? '服务检查' : '未配置 SSH 凭据'}>
                        <span>
                          <IconButton size="small" onClick={() => void openServices(h)} disabled={!h.credentialId}>
                            <IconServices fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="终端">
                        <IconButton size="small" onClick={() => goTerminal(h)}>
                          <IconTerminal fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="删除">
                        <IconButton size="small" onClick={() => askDelete(h.id, h.name)}>
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

      <Dialog open={confirmDeleteId !== null} onClose={() => setConfirmDeleteId(null)} maxWidth="xs" fullWidth>
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          确定要删除主机「{confirmDeleteName}」吗？此操作不可撤销。
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteId(null)}>取消</Button>
          <Button color="error" variant="contained" onClick={() => void confirmDelete()}>删除</Button>
        </DialogActions>
      </Dialog>

      {/* 页内终端 */}
      <TerminalDialog
        open={!!termHost}
        host={termHost?.host ?? ''}
        port={termHost?.port ?? 22}
        credentialId={termHost?.credentialId ?? ''}
        name={termHost?.name ?? ''}
        onClose={() => setTermHost(null)}
      />

      {/* AI 主机诊断 */}
      <AiDialog
        open={!!aiHost}
        title={`AI 诊断：${aiHost?.name ?? ''}`}
        context={aiHost ? { kind: 'host', payload: { name: aiHost.name, host: aiHost.host, reachable: aiHost.reachable, healthScore: aiHost.healthScore, status: aiHost.status, cpuPct: metricMap.get(aiHost.id)?.cpuPct, memPct: metricMap.get(aiHost.id)?.memPct, diskPct: metricMap.get(aiHost.id)?.diskPct } } : null}
        onClose={() => setAiHost(null)}
      />

      {/* 服务检查 */}
      <Dialog open={!!svcHost} onClose={() => setSvcHost(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconServices sx={{ color: theme.palette.primary.main }} />
          服务检查 · {svcHost?.name}（{svcHost?.host}）
        </DialogTitle>
        <DialogContent>
          {svcLoading ? (
            <Box display="flex" justifyContent="center" py={6}>
              <CircularProgress size={28} />
            </Box>
          ) : svcError ? (
            <Alert severity="error">{svcError}</Alert>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>服务</TableCell>
                  <TableCell>状态</TableCell>
                  <TableCell>描述</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(svcList ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} sx={{ color: theme.palette.text.secondary }}>
                      未采集到服务（目标主机可能非 systemd 环境）。
                    </TableCell>
                  </TableRow>
                )}
                {(svcList ?? []).map((s, i) => (
                  <TableRow key={i} hover>
                    <TableCell sx={{ fontWeight: 600, fontFamily: 'monospace' }}>{s.name}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={s.status}
                        color={s.active ? 'success' : s.status.includes('failed') ? 'error' : 'default'}
                        variant="outlined"
                        sx={{ height: 20, fontSize: 11 }}
                      />
                    </TableCell>
                    <TableCell sx={{ color: theme.palette.text.secondary }}>{s.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSvcHost(null)}>关闭</Button>
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
