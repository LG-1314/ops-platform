import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Box,
  Paper,
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
  CircularProgress,
  Tooltip,
  Divider,
  Grid,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
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
import DataTable, { type Column } from '../components/DataTable'
import PageHeader from '../components/PageHeader'
import MetricBar from '../components/MetricBar'
import StatusBadge from '../components/StatusBadge'
import HostTrendDrawer from '../components/HostTrendDrawer'
import TerminalDialog from '../components/TerminalDialog'
import AiDialog from '../components/AiDialog'
import type { MonitorSummary } from '../../capabilities/bus'

function assetDisplayStatus(host: Asset): { status: Status; label: string; reason?: string } {
  if (host.reachable === false) {
    return { status: 'error', label: '离线', reason: host.statusReason || '设备离线/未采集数据' }
  }
  if (host.reachable !== true) {
    return { status: 'unknown', label: '未探测', reason: host.statusReason }
  }
  if (host.status === 'error') return { status: 'error', label: '连接失败', reason: host.statusReason }
  if (host.status === 'warn') return { status: 'warn', label: '在线异常', reason: host.statusReason }
  return { status: 'ok', label: '在线', reason: host.statusReason }
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
  // 添加主机弹窗内的提交错误（页面级错误会被弹窗遮挡）
  const [formError, setFormError] = useState('')
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
      const s = await api.ssh.collect({ host: host.ip || host.host, credentialId: host.credentialId, assetId: host.id })
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
          await api.ssh.collect({ host: h.ip || h.host, credentialId: h.credentialId, assetId: h.id })
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
    setFormError('')
    // 端口防呆：清空输入会得到 NaN/0，直接拦在表单层
    const port = Number(form.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setFormError('SSH 端口需为 1-65535 的整数')
      setSubmitting(false)
      return
    }
    let credentialId: string | undefined
    try {
      if (form.username && (form.password || form.privateKey)) {
        const cred = await api.credentials.create({
          name: `${form.name || form.host} SSH 凭据`,
          kind: 'ssh',
          host: form.host,
          port, // SSH 端口属于凭据（此前误写进 asset.port，被当成探测端口）
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
        source: 'ssh',
        tags: ['ssh'],
        credentialId,
      })
      setOpen(false)
      setForm({ name: '', host: '', port: 22, authMethod: 'password', username: '', password: '', privateKey: '' })
      await load()
    } catch (e) {
      // 两段式创建：资产失败时回收刚创建的凭据，避免孤儿凭据留在列表
      if (credentialId) await api.credentials.remove(credentialId).catch(() => {})
      // 错误展示在弹窗内：页面级 Alert 会被打开的弹窗遮挡，用户只会看到"保存没反应"
      setFormError((e as Error).message || '保存失败')
    } finally {
      setSubmitting(false)
    }
  }

  const columns: Column<Asset>[] = [
    {
      key: 'name',
      label: '名称',
      render: (h) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconHost fontSize="small" sx={{ color: theme.palette.primary.main }} />
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{h.name}</Typography>
        </Box>
      ),
    },
    {
      key: 'host',
      label: '地址',
      render: (h) => <Typography variant="body2" sx={{ fontFamily: 'var(--font-mono)' }}>{h.host}:{h.port ?? 22}</Typography>,
    },
    {
      key: '__metrics',
      label: '实时指标',
      render: (h) => {
        const m = metricMap.get(h.id)
        return m ? (
          <Stack spacing={0.4}>
            <MetricBar label="CPU" pct={m.cpuPct} compact />
            <MetricBar label="内存" pct={m.memPct} compact />
            <MetricBar label="磁盘" pct={m.diskPct} compact />
          </Stack>
        ) : (
          <Typography variant="caption" color="text.secondary">未采集</Typography>
        )
      },
    },
    {
      key: 'credentialId',
      label: '凭据',
      render: (h) => h.credentialId ? '已关联' : '无',
    },
    {
      key: '__status',
      label: '状态',
      render: (h) => {
        const ds = assetDisplayStatus(h)
        return (
          <Tooltip title={ds.reason || ''}>
            <span>
              <StatusBadge status={ds.status} label={ds.label} />
            </span>
          </Tooltip>
        )
      },
    },
    {
      key: '__actions',
      label: '操作',
      render: (h) => (
        <Stack direction="row" spacing={0.5} alignItems="center">
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
        </Stack>
      ),
    },
  ]

  return (
    <Box>
      <PageHeader
        title="主机监控"
        subtitle="添加主机并经由 SSH 采集 CPU / 内存 / 磁盘 / 负载指标，一键进入终端"
        actions={
          <>
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
          </>
        }
      />

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
          <DataTable columns={columns} rows={hosts} emptyText="暂无主机，点击「添加主机」开始纳管。" />
        )}
      </Paper>

      {/* 添加主机 */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>添加主机</DialogTitle>
        <DialogContent>
          {formError && (
            <Alert severity="error" sx={{ mt: 1 }} onClose={() => setFormError('')}>
              {formError}
            </Alert>
          )}
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="名称"
                fullWidth
                size="small"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="主机地址"
                fullWidth
                size="small"
                value={form.host}
                onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
                placeholder="192.168.1.10 或 hostname"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="SSH 端口"
                type="number"
                fullWidth
                size="small"
                value={form.port}
                error={formError.includes('端口')}
                onChange={(e) => setForm((f) => ({ ...f, port: Number(e.target.value) }))}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="用户名"
                fullWidth
                size="small"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="认证方式"
                select
                fullWidth
                size="small"
                value={form.authMethod}
                onChange={(e) => setForm((f) => ({ ...f, authMethod: e.target.value as 'password' | 'privateKey' }))}
              >
                <MenuItem value="password">密码</MenuItem>
                <MenuItem value="privateKey">私钥</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              {form.authMethod === 'password' ? (
                <TextField
                  label="密码"
                  type="password"
                  fullWidth
                  size="small"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                />
              ) : (
                <TextField
                  label="私钥 (PEM)"
                  multiline
                  minRows={3}
                  fullWidth
                  size="small"
                  value={form.privateKey}
                  onChange={(e) => setForm((f) => ({ ...f, privateKey: e.target.value }))}
                />
              )}
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={submitting}>取消</Button>
          <Button
            variant="contained"
            disabled={submitting || !form.host}
            onClick={() => void onSubmit()}
          >
            {submitting ? '保存中…' : '保存'}
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
                  <Typography component="span" sx={{ ml: 1, color: theme.palette.text.secondary, fontFamily: 'var(--font-mono)' }}>
                    {sample.hostname}
                  </Typography>
                )}
              </Box>
              {sample.uptime && (
                <Typography variant="body2">运行时长：{sample.uptime}</Typography>
              )}
              <Divider />
              {typeof sample.cpuIdle === 'number' && (
                <MetricBar label="CPU 使用率" pct={Math.max(0, Math.round(100 - sample.cpuIdle))} />
              )}
              {sample.memTotalMb && sample.memUsedMb != null ? (
                <MetricBar
                  label={`内存使用率 (${sample.memUsedMb}/${sample.memTotalMb} MB)`}
                  pct={Math.round((sample.memUsedMb / sample.memTotalMb) * 100)}
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
                <MetricBar key={i} label={`${d.mount} (${d.usedGb}/${d.totalGb} GB)`} pct={d.usedPct} />
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
            <DataTable
              columns={[
                { key: 'name', label: '服务', render: (s) => <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{s.name}</Typography> },
                {
                  key: 'status',
                  label: '状态',
                  render: (s) => (
                    <Chip
                      size="small"
                      label={s.status}
                      color={s.active ? 'success' : s.status.includes('failed') ? 'error' : 'default'}
                      variant="outlined"
                      sx={{ height: 20, fontSize: 11 }}
                    />
                  ),
                },
                { key: 'description', label: '描述', render: (s) => <Typography variant="body2" color="text.secondary">{s.description}</Typography> },
              ]}
              rows={svcList ?? []}
              emptyText="未采集到服务（目标主机可能非 systemd 环境）。"
              pageSize={0}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSvcHost(null)}>关闭</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
