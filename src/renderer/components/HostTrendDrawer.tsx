import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
  CircularProgress,
  Alert,
  Paper,
  Stack,
  Chip,
  TextField,
  Button,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { Close as IconClose, Refresh as IconRefresh, ShowChart as IconTrend } from '@mui/icons-material'
import { api } from '../../capabilities/bus'
import type { Asset, HostMetricSample } from '@shared/types'
import MetricBar from './MetricBar'
import MetricLineChart, { type TrendPoint } from './MetricLineChart'

type RangeKey = '1h' | '6h' | '24h' | 'custom'
const RANGE_MS: Record<Exclude<RangeKey, 'custom'>, number> = { '1h': 3600e3, '6h': 21600e3, '24h': 86400e3 }

function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

function cpuPct(s: HostMetricSample): number | undefined {
  return typeof s.cpuIdle === 'number' ? Math.max(0, Math.round(100 - s.cpuIdle)) : undefined
}
function memPct(s: HostMetricSample): number | undefined {
  return s.memTotalMb && s.memUsedMb != null ? Math.round((s.memUsedMb / s.memTotalMb) * 100) : undefined
}
function diskPct(s: HostMetricSample): number | undefined {
  if (!s.disk.length) return undefined
  return Math.max(...s.disk.map((d) => d.usedPct))
}

interface Series {
  key: string
  label: string
  unit: string
  points: TrendPoint[]
  current?: number
}

interface Props {
  open: boolean
  asset: Asset | null
  onClose: () => void
}

export default function HostTrendDrawer({ open, asset, onClose }: Props) {
  const theme = useTheme()
  const [range, setRange] = useState<RangeKey>('24h')
  const [data, setData] = useState<HostMetricSample[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const load = useCallback(async () => {
    if (!asset) return
    setLoading(true)
    setError(null)
    try {
      let from: string
      let to: string
      if (range === 'custom') {
        from = customFrom ? new Date(customFrom).toISOString() : new Date(Date.now() - RANGE_MS['24h']).toISOString()
        to = customTo ? new Date(customTo).toISOString() : new Date().toISOString()
      } else {
        const now = Date.now()
        from = new Date(now - RANGE_MS[range]).toISOString()
        to = new Date(now).toISOString()
      }
      setData(await api.metrics.history(asset.id, from, to))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  // 自定义起止时间不进依赖是刻意的：datetime-local 每敲一个字符都会触发 onChange，
  // 逐键发起 /metrics/history 请求（并有竞态覆盖）；改为点「查询」按钮手动加载。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset, range])

  // 仅在抽屉打开 / 切换资产 / 切换预设区间时自动加载。
  // 自定义起止时间不进依赖：datetime-local 每敲一个字符都会触发 onChange，
  // 此前会逐键发起 /metrics/history 请求（并有竞态覆盖），改为点「查询」手动加载。
  useEffect(() => {
    if (open && asset) void load()
  }, [open, asset, load])

  function onRangeChange(next: RangeKey) {
    if (next === 'custom' && !customFrom) {
      const now = new Date()
      setCustomFrom(toLocalInput(new Date(now.getTime() - RANGE_MS['24h'])))
      setCustomTo(toLocalInput(now))
    }
    setRange(next)
  }

  const series = useMemo<Series[]>(() => {
    const cpu: TrendPoint[] = []
    const mem: TrendPoint[] = []
    const disk: TrendPoint[] = []
    const load: TrendPoint[] = []
    const net: TrendPoint[] = []
    let prevRx: number | undefined
    let prevT: number | undefined
    for (const s of data) {
      const t = fmtTime(s.collectedAt)
      const c = cpuPct(s)
      if (c != null) cpu.push({ t, v: c })
      const m = memPct(s)
      if (m != null) mem.push({ t, v: m })
      const d = diskPct(s)
      if (d != null) disk.push({ t, v: d })
      if (s.load1 != null) load.push({ t, v: Math.round(s.load1 * 100) / 100 })
      if (s.network?.rxBytes != null) {
        const ts = Date.parse(s.collectedAt)
        if (prevRx != null && prevT != null && ts > prevT) {
          // KB/s
          net.push({ t, v: Math.round(((s.network.rxBytes - prevRx) / (ts - prevT)) * 1000) / 1024 })
        }
        prevRx = s.network.rxBytes
        prevT = ts
      }
    }
    const latest = data.length ? data[data.length - 1] : undefined
    const out: Series[] = [
      { key: 'cpu', label: 'CPU 使用率', unit: '%', points: cpu, current: latest ? cpuPct(latest) : undefined },
      { key: 'mem', label: '内存使用率', unit: '%', points: mem, current: latest ? memPct(latest) : undefined },
      { key: 'disk', label: '磁盘使用率（最大挂载）', unit: '%', points: disk, current: latest ? diskPct(latest) : undefined },
      { key: 'load', label: '系统负载 (load1)', unit: '', points: load, current: latest?.load1 },
    ]
    if (net.length > 0) out.push({ key: 'net', label: '网络接收速率', unit: 'KB/s', points: net, current: net[net.length - 1]?.v })
    return out
  }, [data])

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{ '& .MuiDrawer-paper': { width: { xs: '100vw', sm: 'min(560px, 92vw)' }, bgcolor: 'background.paper' } }}
    >
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* 头部 */}
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <IconTrend sx={{ color: theme.palette.primary.main }} />
          <Typography variant="h6" sx={{ fontWeight: 700, flexGrow: 1 }}>
            {asset?.name ?? '主机'}
          </Typography>
          {asset?.reachable && (
            <Chip size="small" label="在线" color="success" variant="outlined" />
          )}
          <IconButton size="small" onClick={() => void load()} disabled={loading}>
            <IconRefresh fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={onClose}>
            <IconClose fontSize="small" />
          </IconButton>
        </Stack>
        {asset && (
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, fontFamily: 'var(--font-mono)' }}>
            {asset.host}:{asset.port ?? 22}
          </Typography>
        )}

        {/* 时间范围切换 */}
        <ToggleButtonGroup
          value={range}
          exclusive
          size="small"
          onChange={(_, v: RangeKey | null) => v && onRangeChange(v)}
          sx={{ mb: 2 }}
        >
          <ToggleButton value="1h">1h</ToggleButton>
          <ToggleButton value="6h">6h</ToggleButton>
          <ToggleButton value="24h">24h</ToggleButton>
          <ToggleButton value="custom">自定义</ToggleButton>
        </ToggleButtonGroup>

        {range === 'custom' && (
          <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
            <TextField
              label="开始"
              size="small"
              type="datetime-local"
              InputLabelProps={{ shrink: true }}
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              sx={{ flex: 1 }}
            />
            <TextField
              label="结束"
              size="small"
              type="datetime-local"
              InputLabelProps={{ shrink: true }}
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              sx={{ flex: 1 }}
            />
            <Button size="small" variant="outlined" onClick={() => void load()}>查询</Button>
          </Stack>
        )}

        {/* 内容区 */}
        <Box sx={{ flexGrow: 1, overflowY: 'auto', pr: 0.5 }}>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {loading && data.length === 0 ? (
            <Box display="flex" justifyContent="center" py={8}>
              <CircularProgress size={28} />
            </Box>
          ) : data.length === 0 && !error ? (
            <Box textAlign="center" py={8}>
              <IconTrend sx={{ fontSize: 40, color: theme.palette.text.disabled }} />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                暂无数据。请先为该主机关联 SSH 凭据并采集指标（自动每 60s 采集）。
              </Typography>
            </Box>
          ) : (
            <>
              {/* 概览：最新值 */}
              <Paper sx={{ p: 2, mb: 2, border: `1px solid ${theme.palette.divider}` }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>当前状态</Typography>
                {series
                  .filter((s) => s.key !== 'load' && s.key !== 'net')
                  .map((s) =>
                    s.current != null ? <MetricBar key={s.key} label={s.label} pct={s.current} /> : null
                  )}
                {series.find((s) => s.key === 'load')?.current != null && (
                  <Typography variant="body2" color="text.secondary">
                    系统负载：{series.find((s) => s.key === 'load')?.current}
                  </Typography>
                )}
              </Paper>

              {/* 趋势曲线 */}
              {series.map((s) => (
                <Paper key={s.key} sx={{ p: 2, mb: 1.5, border: `1px solid ${theme.palette.divider}` }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{s.label}</Typography>
                    {s.current != null && (
                      <Typography variant="body2" sx={{ fontFamily: 'var(--font-mono)', color: theme.palette.primary.main }}>
                        {s.current}
                        {s.unit}
                      </Typography>
                    )}
                  </Stack>
                  {s.points.length > 0 ? (
                    <MetricLineChart label={s.label} data={s.points} />
                  ) : (
                    <Typography variant="caption" color="text.secondary">暂无该指标数据</Typography>
                  )}
                </Paper>
              ))}
            </>
          )}
        </Box>
      </Box>
    </Drawer>
  )
}
