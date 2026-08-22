import { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Typography,
  Stack,
  Card,
  CardContent,
  Paper,
  Grid,
  Divider,
  CircularProgress,
  Chip,
  Alert as MuiAlert,
  LinearProgress,
  useTheme,
  IconButton,
  Tooltip,
} from '@mui/material'
import {
  MonitorHeart as IconMonitor,
  Refresh as IconRefresh,
  Storage as IconDb,
  Dns as IconCluster,
  Speed as IconSpeed,
  Computer as IconHost,
  Terminal as IconTerminal,
  ShowChart as IconTrend,
  PlayArrow as IconCollect,
  CheckCircle,
  Error as ErrorIcon,
  HelpOutline,
} from '@mui/icons-material'
import { api, type MonitorSummary, ApiClientError } from '../../capabilities/bus'
import type { HealthPoint, Asset } from '@shared/types'
import PageHeader from '../components/PageHeader'
import MetricLineChart, { type TrendPoint } from '../components/MetricLineChart'
import HealthRing from '../components/HealthRing'
import HostTrendDrawer from '../components/HostTrendDrawer'
import TerminalDialog from '../components/TerminalDialog'
import type { Theme } from '@mui/material'

function Bar({ label, pct, theme }: { label: string; pct?: number; theme: Theme }) {
  if (pct == null) return null
  const color = pct >= 90 ? theme.palette.error.main : pct >= 75 ? theme.palette.warning.main : theme.palette.success.main
  return (
    <Box sx={{ mb: 0.8 }}>
      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.2 }}>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Typography variant="caption" sx={{ fontFamily: 'monospace', color }}>{pct}%</Typography>
      </Stack>
      <LinearProgress variant="determinate" value={pct} sx={{ height: 4, borderRadius: 2, '& .MuiLinearProgress-bar': { backgroundColor: color } }} />
    </Box>
  )
}

// 稳定空数组引用：避免 `summary?.hosts ?? []` 每次渲染生成新数组
const EMPTY_HOSTS: MonitorSummary['hosts'] = []

function fmtTime(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 离线 / 未探测 / 未采集的主机视为"健康分不可用"，展示 '—' 而非 0，避免误导 */
function hostScoreAvailable(h: MonitorSummary['hosts'][number]): boolean {
  return h.reachable === true && h.healthScore != null
}

export default function Monitor() {
  const theme = useTheme()
  const [summary, setSummary] = useState<MonitorSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // 页内抽屉：趋势 / 终端（不再跳转其他页签，看完即关）
  const [trendAsset, setTrendAsset] = useState<Asset | null>(null)
  const [termHost, setTermHost] = useState<MonitorSummary['hosts'][number] | null>(null)

  const load = () => {
    setLoading(true)
    setError('')
    api.monitor
      .summary()
      .then(setSummary)
      .catch((e) => setError((e as Error).message || '加载失败'))
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    load()
    const t = setInterval(load, 30000) // 30s 自动刷新
    return () => clearInterval(t)
  }, [])

  const onlineCount = useMemo(
    () => summary?.hosts.filter((h) => h.reachable).length ?? 0,
    [summary]
  )
  // 平均健康分：仅统计"在线且已评分"的主机；全部离线/未探测时显示 '—'
  const avgHealth = useMemo(() => {
    const scored = summary?.hosts.filter(hostScoreAvailable) ?? []
    if (scored.length === 0) return null
    return Math.round(scored.reduce((a, h) => a + (h.healthScore ?? 0), 0) / scored.length)
  }, [summary])

  // 直接复用 summary.hosts（无需克隆，避免字段增删不同步）；
  // 用模块级空数组常量，避免 `?? []` 每次渲染生成新引用导致 sortedHosts useMemo 失效
  const hostSeries = summary?.hosts ?? EMPTY_HOSTS

  // 排序：在线+健康分高优先
  const sortedHosts = useMemo(
    () => [...hostSeries].sort((a, b) => {
      if (a.reachable && !b.reachable) return -1
      if (!a.reachable && b.reachable) return 1
      return (b.healthScore ?? 0) - (a.healthScore ?? 0)
    }),
    [hostSeries]
  )

  // 页内打开终端：构造资产对象供 TerminalDialog 使用
  const openTerminal = (h: MonitorSummary['hosts'][number]) => setTermHost(h)

  return (
    <Box>
      <PageHeader
        title="多服务器可视化监控"
        subtitle="全部主机实时健康聚合 · 30s 自动刷新 · 在线/离线/指标一目了然"
        actions={
          <IconButton onClick={load} disabled={loading} title="刷新">
            {loading ? <CircularProgress size={20} /> : <IconRefresh />}
          </IconButton>
        }
      />

      {error && <MuiAlert severity="error" sx={{ mb: 2 }}>{error}</MuiAlert>}

      {!summary && loading ? (
        <Box display="flex" justifyContent="center" py={8}>
          <CircularProgress />
        </Box>
      ) : summary ? (
        <>
          {/* KPI 概览行 */}
          <Grid container spacing={2} mb={2}>
            <Grid item xs={6} sm={3}>
              <Card>
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <IconSpeed sx={{ color: theme.palette.primary.main, fontSize: 20 }} />
                    <Box>
                      <Typography variant="caption" color="text.secondary">纳管资产</Typography>
                      <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{summary.totalAssets}</Typography>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Card>
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <IconHost sx={{ color: onlineCount > 0 ? theme.palette.success.main : theme.palette.text.disabled, fontSize: 20 }} />
                    <Box>
                      <Typography variant="caption" color="text.secondary">在线主机</Typography>
                      <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2, color: onlineCount > 0 ? theme.palette.success.main : theme.palette.text.disabled }}>
                        {onlineCount}/{summary.hosts.length}
                      </Typography>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Card>
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <IconMonitor sx={{ color: theme.palette.primary.main, fontSize: 20 }} />
                    <Box>
                      <Typography variant="caption" color="text.secondary">平均健康分</Typography>
                      <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2, color: avgHealth == null ? theme.palette.text.disabled : theme.palette.success.main }}>
                        {avgHealth ?? '—'}
                      </Typography>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Card>
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <IconMonitor sx={{ color: summary.activeAlerts > 0 ? theme.palette.error.main : theme.palette.success.main, fontSize: 20 }} />
                    <Box>
                      <Typography variant="caption" color="text.secondary">活跃告警</Typography>
                      <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2, color: summary.activeAlerts > 0 ? theme.palette.error.main : theme.palette.success.main }}>
                        {summary.activeAlerts}
                      </Typography>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* 服务器实时监控网格 */}
          <Typography variant="subtitle1" sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconMonitor fontSize="small" sx={{ color: theme.palette.primary.main }} />
            服务器实时监控
            <Chip size="small" label={`${sortedHosts.length} 台`} variant="outlined" />
          </Typography>

          {sortedHosts.length === 0 ? (
            <Paper sx={{ p: 3, mb: 2, textAlign: 'center', color: theme.palette.text.secondary }}>
              暂无主机数据。请先通过「资产纳管」添加主机或「主机」页关联 SSH 凭据采集指标。
            </Paper>
          ) : (
            <Grid container spacing={2} mb={3}>
              {sortedHosts.map((h) => (
                <Grid item xs={12} sm={6} lg={4} xl={3} key={h.id}>
                  <Card sx={{ '&:hover': { borderColor: theme.palette.primary.main } }}>
                    <CardContent>
                      {/* 主机头部：名称 + 状态 + 健康环 */}
                      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                          <IconHost sx={{ color: theme.palette.primary.main, fontSize: 20 }} />
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="subtitle2" noWrap>{h.name}</Typography>
                            <Typography variant="caption" color="text.secondary" noWrap sx={{ fontFamily: 'monospace' }}>
                              {h.host ?? ''}{h.port ? `:${h.port}` : ''}
                            </Typography>
                          </Box>
                        </Stack>
                        <HealthRing score={h.healthScore ?? 0} size={44} unavailable={!hostScoreAvailable(h)} />
                      </Stack>

                      {/* 在线状态 + 延迟 + 最后检查 */}
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                        <Chip
                          size="small"
                          icon={h.reachable ? <CheckCircle sx={{ fontSize: 14 }} /> : h.reachable === false ? <ErrorIcon sx={{ fontSize: 14 }} /> : <HelpOutline sx={{ fontSize: 14 }} />}
                          label={h.reachable ? '在线' : h.reachable === false ? '离线' : '未探测'}
                          sx={{
                            height: 22,
                            fontSize: 11,
                            bgcolor: h.reachable ? `${theme.palette.success.main}22` : h.reachable === false ? `${theme.palette.error.main}22` : `${theme.palette.text.disabled}22`,
                            color: h.reachable ? theme.palette.success.main : h.reachable === false ? theme.palette.error.main : theme.palette.text.disabled,
                          }}
                        />
                        {h.latencyMs != null && (
                          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                            {h.latencyMs}ms
                          </Typography>
                        )}
                        {h.lastCheckAt && (
                          <Typography variant="caption" color="text.disabled" sx={{ ml: 'auto', fontFamily: 'monospace', fontSize: 10 }}>
                            {fmtTime(h.lastCheckAt)}
                          </Typography>
                        )}
                      </Stack>

                      {/* 指标进度条 */}
                      <Bar label="CPU 使用率" pct={h.cpuPct} theme={theme} />
                      <Bar label="内存使用率" pct={h.memPct} theme={theme} />
                      <Bar label="磁盘使用率" pct={h.diskPct} theme={theme} />

                      {/* 网络速率 */}
                      {(h.netRx != null || h.netTx != null) && (
                        <Stack direction="row" spacing={2} sx={{ mt: 0.5 }}>
                          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                            ↓ {h.netRx != null ? `${h.netRx.toFixed(1)} KB/s` : '-'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                            ↑ {h.netTx != null ? `${h.netTx.toFixed(1)} KB/s` : '-'}
                          </Typography>
                        </Stack>
                      )}

                      {/* 采集时间 */}
                      {h.collectedAt && (
                        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5, fontFamily: 'monospace', fontSize: 10 }}>
                          采集于 {fmtTime(h.collectedAt)}
                        </Typography>
                      )}

                      {/* 操作按钮 */}
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end" sx={{ mt: 1, pt: 1, borderTop: `1px solid ${theme.palette.divider}` }}>
                        <Tooltip title="SSH 终端（页内打开）">
                          <IconButton size="small" onClick={() => openTerminal(h)}>
                            <IconTerminal fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="趋势（页内打开）">
                          <IconButton size="small" onClick={() => {
                            setTrendAsset({ id: h.id, name: h.name, host: h.host ?? '', type: 'server', source: 'ssh', tags: [], createdAt: '', healthScore: h.healthScore ?? 0, status: h.status, reachable: h.reachable, latencyMs: h.latencyMs, lastCheckAt: h.lastCheckAt } as Asset)
                          }}>
                            <IconTrend fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {h.credentialId && (
                          <Tooltip title="立即采集">
                            <IconButton size="small" onClick={async () => {
                              try {
                                await api.ssh.collect({ host: h.host ?? '', port: h.port, credentialId: h.credentialId, assetId: h.id })
                                load()
                              } catch (e) {
                                setError((e as ApiClientError).detail || (e as Error).message || '采集失败，请检查主机连通性与 SSH 凭据')
                              }
                            }}>
                              <IconCollect fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}

          {/* DB 与集群健康时序 */}
          <Typography variant="subtitle1" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconDb fontSize="small" sx={{ color: theme.palette.primary.main }} />
            数据库与集群健康
          </Typography>
          <HealthTabs />
        </>
      ) : null}

      {/* 页内趋势抽屉（不再跳转主机页） */}
      <HostTrendDrawer open={!!trendAsset} asset={trendAsset} onClose={() => setTrendAsset(null)} />

      {/* 页内 SSH 终端（不再跳转终端页签） */}
      <TerminalDialog
        open={!!termHost}
        host={termHost?.host ?? ''}
        port={termHost?.port ?? 22}
        credentialId={termHost?.credentialId ?? ''}
        name={termHost?.name ?? ''}
        onClose={() => setTermHost(null)}
      />
    </Box>
  )
}

/** DB / 集群健康时序子组件 */
function HealthTabs() {
  const theme = useTheme()
  const [tab, setTab] = useState<'db' | 'cluster'>('db')
  const [items, setItems] = useState<{ id: string; name: string }[]>([])
  const [selected, setSelected] = useState('')
  const [points, setPoints] = useState<HealthPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadList = async () => {
    try {
      if (tab === 'db') {
        const list = await api.db.list()
        const mapped = list.map((x) => ({ id: x.id, name: x.name }))
        setItems(mapped)
        if (mapped.length > 0 && !mapped.some((m) => m.id === selected)) setSelected(mapped[0].id)
      } else {
        const list = await api.clusters.list()
        const mapped = list.map((x) => ({ id: x.id, name: x.name }))
        setItems(mapped)
        if (mapped.length > 0 && !mapped.some((m) => m.id === selected)) setSelected(mapped[0].id)
      }
      setError('')
    } catch (e) {
      setError((e as Error).message || '加载健康列表失败')
    }
  }

  useEffect(() => { void loadList() }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selected) return
    setLoading(true)
    setError('')
    const to = new Date().toISOString()
    const from = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    api.monitor
      .healthHistory(tab, selected, from, to)
      .then(setPoints)
      .catch((e) => setError((e as Error).message || '加载失败'))
      .finally(() => setLoading(false))
  }, [tab, selected])

  const trend = useMemo<TrendPoint[]>(() => points.map((p) => ({ t: fmtTime(p.checkedAt), v: p.score })), [points])

  return (
    <Paper sx={{ p: 2, mb: 2, border: `1px solid ${theme.palette.divider}` }}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
        <Chip size="small" icon={<IconDb fontSize="small" />} label="数据库" color={tab === 'db' ? 'primary' : 'default'} onClick={() => setTab('db')} clickable />
        <Chip size="small" icon={<IconCluster fontSize="small" />} label="集群" color={tab === 'cluster' ? 'primary' : 'default'} onClick={() => setTab('cluster')} clickable />
        {items.map((it) => (
          <Chip key={it.id} size="small" label={it.name} variant={selected === it.id ? 'filled' : 'outlined'} color={selected === it.id ? 'primary' : 'default'} onClick={() => setSelected(it.id)} clickable />
        ))}
      </Stack>
      <Divider sx={{ mb: 1.5 }} />
      {error && <MuiAlert severity="error" sx={{ mb: 1.5 }}>{error}</MuiAlert>}
      {loading ? (
        <Box display="flex" justifyContent="center" py={4}><CircularProgress size={24} /></Box>
      ) : trend.length === 0 ? (
        <Typography variant="body2" color="text.secondary" align="center" py={3}>暂无健康时序数据（后台每 2-5 分钟自动采集一次）。</Typography>
      ) : (
        <MetricLineChart label={`${tab === 'db' ? '数据库' : '集群'}健康分`} data={trend} />
      )}
    </Paper>
  )
}