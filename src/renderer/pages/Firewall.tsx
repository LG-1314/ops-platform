import { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Typography,
  Stack,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Card,
  CardContent,
  TextField,
  MenuItem,
  Button,
  Chip,
  CircularProgress,
  Alert as MuiAlert,
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
  useTheme,
  Grid,
} from '@mui/material'
import {
  Shield as IconFirewall,
  Add as IconAdd,
  Delete as IconDelete,
  Refresh as IconRefresh,
  PlayArrow as IconPlay,
  Dns as IconPort,
  Lan as IconConn,
  Speed as IconTraffic,
  Block as IconBlock,
  Download as IconExport,
  Warning,
} from '@mui/icons-material'
import { api } from '../../capabilities/bus'
import type {
  Asset,
  FirewallCollectResult,
  AddFirewallRuleInput,
} from '@shared/types'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'

const CHAINS = ['INPUT', 'OUTPUT', 'FORWARD']
const PROTOCOLS = ['tcp', 'udp', 'icmp', 'all']
const ACTIONS = ['ACCEPT', 'DROP', 'REJECT']

type TabKey = 'rules' | 'ports' | 'connections' | 'traffic'

export default function Firewall() {
  const theme = useTheme()
  const navigate = useNavigate()
  const [assets, setAssets] = useState<Asset[]>([])
  const [assetId, setAssetId] = useState('')
  const [data, setData] = useState<FirewallCollectResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<TabKey>('rules')
  const [notice, setNotice] = useState('')

  // 添加规则
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<AddFirewallRuleInput>({
    chain: 'INPUT',
    protocol: 'tcp',
    source: '',
    destination: '',
    port: '',
    inInterface: '',
    action: 'ACCEPT',
    comment: '',
  })
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  // 加载有 SSH 凭据的资产
  useEffect(() => {
    api.assets
      .list()
      .then((a) => {
        const withCred = a.filter((x) => x.credentialId)
        setAssets(withCred)
        if (withCred.length > 0 && !assetId) setAssetId(withCred[0].id)
      })
      .catch((e) => setError((e as Error).message || '加载资产失败'))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const collect = async (id: string) => {
    if (!id) return
    setLoading(true)
    setError('')
    setNotice('')
    try {
      const r = await api.firewall.collect(id)
      setData(r)
    } catch (e) {
      setError((e as Error).message || '采集失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (assetId) void collect(assetId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId])

  const currentAsset = assets.find((a) => a.id === assetId)

  // 连接状态统计
  const connStats = useMemo(() => {
    const stats: Record<string, number> = {}
    for (const c of data?.connections || []) stats[c.state] = (stats[c.state] || 0) + 1
    return stats
  }, [data])

  const submitAdd = async () => {
    setSaving(true)
    setError('')
    try {
      const r = await api.firewall.addRule(assetId, form)
      if (!r.ok) {
        setError(r.message)
        return
      }
      setNotice(`规则已添加：${r.rule?.raw || ''}`)
      setOpen(false)
      setForm({ chain: 'INPUT', protocol: 'tcp', source: '', destination: '', port: '', inInterface: '', action: 'ACCEPT', comment: '' })
      await collect(assetId)
    } catch (e) {
      setError((e as Error).message || '添加规则失败')
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setSaving(true)
    setError('')
    try {
      const r = await api.firewall.deleteRule(assetId, deleteTarget)
      if (!r.ok) setError(r.message)
      else {
        setNotice('规则已删除')
        setDeleteTarget(null)
        await collect(assetId)
      }
    } catch (e) {
      setError((e as Error).message || '删除规则失败')
    } finally {
      setSaving(false)
    }
  }

  const actionColor = (action: string) =>
    action === 'ACCEPT'
      ? theme.palette.success.main
      : action === 'DROP' || action === 'REJECT'
        ? theme.palette.error.main
        : theme.palette.warning.main

  // 策略导出：把规则集导出为 iptables -S 风格文本（策略备份）
  const exportPolicy = () => {
    if (!data) return
    const lines = data.rules.map((r) => r.raw).join('\n')
    const blob = new Blob([lines], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `iptables-${data.host}-${new Date().toISOString().slice(0, 10)}.rules`
    a.click()
    URL.revokeObjectURL(url)
  }

  // 拦截日志：DROP/REJECT 且有过命中计数的规则
  const blockLogs = (data?.rules || []).filter(
    (r) => (r.action === 'DROP' || r.action === 'REJECT') && (r.packets || 0) > 0,
  )

  const fmtBytes = (n?: number) => {
    if (n == null) return '—'
    if (n < 1024) return `${n} B`
    if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
    if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
    return `${(n / 1024 ** 3).toFixed(2)} GB`
  }

  return (
    <Box>
      <PageHeader
        title="防火墙与网络透视"
        subtitle="经 SSH 采集目标主机 iptables 规则 / 监听端口 / 活动连接，支持带防呆校验的规则管理"
        actions={
          <Button
            variant="contained"
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <IconRefresh />}
            onClick={() => void collect(assetId)}
            disabled={loading || !assetId}
          >
            采集
          </Button>
        }
      />

      {error && <MuiAlert severity="error" sx={{ mb: 2 }}>{error}</MuiAlert>}
      {notice && <MuiAlert severity="success" sx={{ mb: 2 }} onClose={() => setNotice('')}>{notice}</MuiAlert>}

      <Stack direction="row" spacing={2} alignItems="center" mb={2} flexWrap="wrap" useFlexGap>
        <TextField
          select
          size="small"
          label="目标主机（需已关联 SSH 凭据）"
          value={assetId}
          onChange={(e) => setAssetId(e.target.value)}
          sx={{ minWidth: 320 }}
          disabled={assets.length === 0}
        >
          {assets.map((a) => (
            <MenuItem key={a.id} value={a.id}>
              {a.name}（{a.host} · {a.ip || ''}）
            </MenuItem>
          ))}
        </TextField>
        {currentAsset && (
          <Chip
            size="small"
            label={`健康 ${currentAsset.healthScore}`}
            variant="outlined"
          />
        )}
      </Stack>

      {assets.length === 0 && !loading && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <EmptyState
              text="没有已关联 SSH 凭据的主机"
              description="请先在「主机 / 资产」为主机配置 SSH 凭据，再回到此处采集防火墙与网络数据"
              icon={<IconFirewall />}
              action={
                <Stack direction="row" spacing={1} justifyContent="center">
                  <Button variant="contained" startIcon={<IconAdd />} onClick={() => navigate('/hosts')}>
                    前往主机配置凭据
                  </Button>
                </Stack>
              }
            />
          </CardContent>
        </Card>
      )}

      {loading && !data && (
        <Box display="flex" justifyContent="center" py={8}>
          <CircularProgress />
        </Box>
      )}

      {data && !loading && (
        <>
          {/* 概览卡片行 */}
          <Grid container spacing={2} mb={2}>
            <Grid item xs={6} sm={3}>
              <Card>
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <IconFirewall sx={{ color: theme.palette.primary.main, fontSize: 20 }} />
                    <Box>
                      <Typography variant="caption" color="text.secondary">防火墙状态</Typography>
                      <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2, color: data.status.available ? (data.status.enabled ? theme.palette.success.main : theme.palette.warning.main) : theme.palette.error.main }}>
                        {!data.status.available ? '不可用' : data.status.enabled ? '已启用' : '无规则'}
                      </Typography>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Card>
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <IconAdd sx={{ color: theme.palette.primary.main, fontSize: 20 }} />
                    <Box>
                      <Typography variant="caption" color="text.secondary">规则数</Typography>
                      <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{data.status.ruleCount}</Typography>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Card>
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <IconPort sx={{ color: theme.palette.info.main, fontSize: 20 }} />
                    <Box>
                      <Typography variant="caption" color="text.secondary">监听端口</Typography>
                      <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{data.ports.length}</Typography>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Card>
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <IconConn sx={{ color: theme.palette.warning.main, fontSize: 20 }} />
                    <Box>
                      <Typography variant="caption" color="text.secondary">活动连接</Typography>
                      <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{data.connections.length}</Typography>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {data.status.defaultPolicies.length > 0 && (
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
              {data.status.defaultPolicies.map((p) => (
                <Chip
                  key={p.chain}
                  size="small"
                  label={`${p.chain} 默认策略：${p.policy}`}
                  color={p.policy === 'DROP' ? 'error' : p.policy === 'REJECT' ? 'warning' : 'success'}
                  variant="outlined"
                />
              ))}
            </Stack>
          )}

          <Tabs value={tab} onChange={(_e, v: TabKey) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Tab label={`规则管理（${data.rules.length}）`} value="rules" icon={<IconFirewall fontSize="small" />} iconPosition="start" />
            <Tab label={`监听端口（${data.ports.length}）`} value="ports" icon={<IconPort fontSize="small" />} iconPosition="start" />
            <Tab label={`网络连接（${data.connections.length}）`} value="connections" icon={<IconConn fontSize="small" />} iconPosition="start" />
            <Tab label="流量统计" value="traffic" icon={<IconTraffic fontSize="small" />} iconPosition="start" />
          </Tabs>

          {tab === 'rules' && (
            <>
              <Stack direction="row" justifyContent="flex-end" mb={1}>
                <Button variant="outlined" startIcon={<IconExport />} onClick={exportPolicy} sx={{ mr: 1 }}>
                  导出策略备份
                </Button>
                <Button variant="contained" startIcon={<IconAdd />} onClick={() => setOpen(true)}>
                  添加规则
                </Button>
              </Stack>
              <Paper sx={{ p: 0, overflow: 'auto' }}>
                {data.rules.length === 0 ? (
                  <Box py={4}>
                    <EmptyState text="该主机暂无 iptables 规则" description="可通过「添加规则」创建放行 / 拒绝策略" icon={<IconFirewall />} />
                  </Box>
                ) : (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>链</TableCell>
                        <TableCell>协议</TableCell>
                        <TableCell>源地址</TableCell>
                        <TableCell>目的地址</TableCell>
                        <TableCell>端口</TableCell>
                        <TableCell>入接口</TableCell>
                        <TableCell>动作</TableCell>
                        <TableCell>命中</TableCell>
                        <TableCell>注释</TableCell>
                        <TableCell align="right">操作</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.rules.map((r, i) => (
                        <TableRow key={i} hover>
                          <TableCell sx={{ fontWeight: 600 }}>{r.chain}</TableCell>
                          <TableCell>
                            <Chip size="small" label={r.protocol} variant="outlined" sx={{ height: 20, fontSize: 11 }} />
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{r.source || '*'}</TableCell>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{r.destination || '*'}</TableCell>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{r.port || (r.sport ? `sport:${r.sport}` : '*')}</TableCell>
                          <TableCell>{r.inInterface || (r.outInterface || '')}</TableCell>
                          <TableCell>
                            <Chip size="small" label={r.action} sx={{ height: 20, fontSize: 11, color: actionColor(r.action), borderColor: actionColor(r.action), bgcolor: actionColor(r.action) + '22' }} variant="outlined" />
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                            {r.packets != null ? `${r.packets} / ${fmtBytes(r.bytes)}` : '—'}
                          </TableCell>
                          <TableCell sx={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.comment || '—'}</TableCell>
                          <TableCell align="right">
                            <Tooltip title="删除该规则">
                              <IconButton size="small" color="error" onClick={() => setDeleteTarget(r.raw)}>
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
            </>
          )}

          {tab === 'ports' && (
            <Paper sx={{ p: 0, overflow: 'auto' }}>
              {data.ports.length === 0 ? (
                <Box py={4}>
                  <EmptyState text="未采集到监听端口" description="可能命令被限制或无监听服务" icon={<IconPort />} />
                </Box>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>协议</TableCell>
                      <TableCell>监听地址</TableCell>
                      <TableCell>端口</TableCell>
                      <TableCell>进程</TableCell>
                      <TableCell>PID</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.ports.map((p, i) => (
                      <TableRow key={i} hover>
                        <TableCell>
                          <Chip size="small" label={p.protocol} color={p.protocol === 'tcp' ? 'primary' : 'default'} variant="outlined" sx={{ height: 20, fontSize: 11 }} />
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{p.address}</TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13 }}>{p.port}</TableCell>
                        <TableCell>{p.process}</TableCell>
                        <TableCell>{p.pid || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Paper>
          )}

          {tab === 'connections' && (
            <>
              {Object.keys(connStats).length > 0 && (
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                  {Object.entries(connStats).map(([state, count]) => (
                    <Chip
                      key={state}
                      size="small"
                      label={`${state} ${count}`}
                      variant="outlined"
                    />
                  ))}
                </Stack>
              )}
              <Paper sx={{ p: 0, overflow: 'auto' }}>
                {data.connections.length === 0 ? (
                  <Box py={4}>
                    <EmptyState text="当前无活动连接" icon={<IconConn />} />
                  </Box>
                ) : (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>协议</TableCell>
                        <TableCell>本地地址</TableCell>
                        <TableCell>本地端口</TableCell>
                        <TableCell>远端地址</TableCell>
                        <TableCell>远端端口</TableCell>
                        <TableCell>状态</TableCell>
                        <TableCell>进程</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.connections.slice(0, 200).map((c, i) => (
                        <TableRow key={i} hover>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{c.protocol}</TableCell>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{c.localAddress}</TableCell>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{c.localPort}</TableCell>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{c.remoteAddress}</TableCell>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{c.remotePort}</TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={c.state}
                              color={c.state === 'ESTAB' || c.state === 'ESTABLISHED' ? 'success' : c.state === 'LISTEN' ? 'primary' : 'default'}
                              variant="outlined"
                              sx={{ height: 20, fontSize: 11 }}
                            />
                          </TableCell>
                          <TableCell>{c.process || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Paper>
            </>
          )}
          {tab === 'traffic' && (
            <>
              {!data.traffic ? (
                <Box py={4}>
                  <EmptyState
                    text="暂无流量计数"
                    description="iptables 未返回规则命中计数（可能需要 root 权限执行 iptables -L -v -x）"
                    icon={<IconTraffic />}
                  />
                </Box>
              ) : (
                <>
                  <Grid container spacing={2} mb={2}>
                    <Grid item xs={6} sm={3}>
                      <Card>
                        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <IconTraffic sx={{ color: theme.palette.primary.main, fontSize: 20 }} />
                            <Box>
                              <Typography variant="caption" color="text.secondary">规则命中包数</Typography>
                              <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{data.traffic.totalPackets}</Typography>
                            </Box>
                          </Stack>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Card>
                        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <IconTraffic sx={{ color: theme.palette.info.main, fontSize: 20 }} />
                            <Box>
                              <Typography variant="caption" color="text.secondary">命中流量</Typography>
                              <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{fmtBytes(data.traffic.totalBytes)}</Typography>
                            </Box>
                          </Stack>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Card>
                        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <IconBlock sx={{ color: data.traffic.dropPackets > 0 ? theme.palette.error.main : theme.palette.text.disabled, fontSize: 20 }} />
                            <Box>
                              <Typography variant="caption" color="text.secondary">拦截包数（DROP/REJECT）</Typography>
                              <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2, color: data.traffic.dropPackets > 0 ? theme.palette.error.main : undefined }}>
                                {data.traffic.dropPackets}
                              </Typography>
                            </Box>
                          </Stack>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Card>
                        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <IconBlock sx={{ color: data.traffic.dropHits > 0 ? theme.palette.warning.main : theme.palette.text.disabled, fontSize: 20 }} />
                            <Box>
                              <Typography variant="caption" color="text.secondary">拦截命中规则数</Typography>
                              <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{data.traffic.dropHits}</Typography>
                            </Box>
                          </Stack>
                        </CardContent>
                      </Card>
                    </Grid>
                  </Grid>

                  <Typography variant="subtitle2" gutterBottom>
                    异常拦截日志（DROP / REJECT 命中）
                  </Typography>
                  <Paper sx={{ p: 0, overflow: 'auto' }}>
                    {blockLogs.length === 0 ? (
                      <Box py={4}>
                        <EmptyState text="暂无拦截命中" description="DROP / REJECT 规则均未产生拦截计数" icon={<IconBlock />} />
                      </Box>
                    ) : (
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>链</TableCell>
                            <TableCell>动作</TableCell>
                            <TableCell>源地址</TableCell>
                            <TableCell>目的地址</TableCell>
                            <TableCell>端口</TableCell>
                            <TableCell>拦截包数</TableCell>
                            <TableCell>拦截流量</TableCell>
                            <TableCell>注释</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {blockLogs.map((r, i) => (
                            <TableRow key={i} hover>
                              <TableCell sx={{ fontWeight: 600 }}>{r.chain}</TableCell>
                              <TableCell>
                                <Chip size="small" label={r.action} sx={{ height: 20, fontSize: 11, color: actionColor(r.action), borderColor: actionColor(r.action), bgcolor: actionColor(r.action) + '22' }} variant="outlined" />
                              </TableCell>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{r.source || '*'}</TableCell>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{r.destination || '*'}</TableCell>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{r.port || (r.sport ? `sport:${r.sport}` : '*')}</TableCell>
                              <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{r.packets}</TableCell>
                              <TableCell sx={{ fontFamily: 'monospace' }}>{fmtBytes(r.bytes)}</TableCell>
                              <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.comment || '—'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </Paper>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                    计数来自 iptables -L -v -x，为内核累计值；数据采集时间 {new Date(data.traffic.collectedAt).toLocaleString('zh-CN', { hour12: false })}
                  </Typography>
                </>
              )}
            </>
          )}
        </>
      )}

      {/* 添加规则对话框 */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>添加防火墙规则</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Stack direction="row" spacing={1.5}>
              <TextField select label="链" size="small" fullWidth value={form.chain} onChange={(e) => setForm({ ...form, chain: e.target.value })}>
                {CHAINS.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
              </TextField>
              <TextField select label="协议" size="small" fullWidth value={form.protocol} onChange={(e) => setForm({ ...form, protocol: e.target.value })}>
                {PROTOCOLS.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
              </TextField>
              <TextField select label="动作" size="small" fullWidth value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })}>
                {ACTIONS.map((a) => <MenuItem key={a} value={a}>{a}</MenuItem>)}
              </TextField>
            </Stack>
            <TextField label="端口（1-65535，可逗号分隔）" size="small" fullWidth value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} placeholder="如 22 / 80,443（留空=全部端口）" />
            <Stack direction="row" spacing={1.5}>
              <TextField label="源地址（可选）" size="small" fullWidth value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="如 192.168.1.0/24" />
              <TextField label="目的地址（可选）" size="small" fullWidth value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} placeholder="如 0.0.0.0/0" />
            </Stack>
            <Stack direction="row" spacing={1.5}>
              <TextField label="入接口（可选）" size="small" fullWidth value={form.inInterface} onChange={(e) => setForm({ ...form, inInterface: e.target.value })} placeholder="如 eth0" />
              <TextField label="注释（可选）" size="small" fullWidth value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} placeholder="如 放行 web 服务" />
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ color: theme.palette.warning.main, fontSize: 12 }}>
              <Warning fontSize="small" />
              <Typography variant="caption" color="text.secondary">
                将向目标主机执行 iptables 命令，动作会立即生效。DROP / REJECT 全流量会被防呆拦截。
              </Typography>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>取消</Button>
          <Button variant="contained" startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <IconPlay />} onClick={() => void submitAdd()} disabled={saving}>
            执行添加
          </Button>
        </DialogActions>
      </Dialog>

      {/* 删除规则确认 */}
      <Dialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>确认删除规则</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all', bgcolor: 'action.hover', p: 1, borderRadius: 1 }}>
            {deleteTarget}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            删除后立即生效，此操作不可撤销。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>取消</Button>
          <Button color="error" variant="contained" onClick={() => void confirmDelete()} disabled={saving}>
            删除
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
