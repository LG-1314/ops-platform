import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Grid,
  Card,
  CardContent,
  Box,
  Typography,
  Stack,
  Divider,
  Alert as MuiAlert,
  useTheme,
  Skeleton,
} from '@mui/material'
import {
  Storage,
  Notifications,
  Schedule,
  MonitorHeart,
  CheckCircle,
  Warning,
  Error as ErrorIcon,
  ShowChart,
  PieChart as PieChartIcon,
  BarChart as BarIcon,
  Insights,
  AutoAwesome as IconAi,
  Close as IconClose,
} from '@mui/icons-material'
import {
  LineChart,
} from '@mui/x-charts/LineChart'
import {
  PieChart,
} from '@mui/x-charts/PieChart'
import {
  BarChart,
} from '@mui/x-charts/BarChart'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  CircularProgress,
  IconButton,
} from '@mui/material'
import tokens from '../theme/design-tokens.json'
import { api } from '../../capabilities/bus'
import type { DashboardSummary, Alert, Asset, Status } from '@shared/types'
import KpiCard from '../components/KpiCard'
import HealthRing from '../components/HealthRing'
import StatusBadge from '../components/StatusBadge'
import DataTable, { Column } from '../components/DataTable'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'

function levelStatus(level: string): Status {
  if (level === 'P0' || level === 'P1') return 'error'
  if (level === 'P2') return 'warn'
  return 'unknown'
}

const LEVEL_ORDER: Alert['level'][] = ['P0', 'P1', 'P2', 'P3']

// 告警状态中文映射（此前直接展示英文枚举 active/ack）
const ALERT_STATE_LABEL: Record<string, string> = {
  active: '未处理',
  ack: '已确认',
  silenced: '已静默',
  resolved: '已解决',
}

// 带超时的 Promise.all：避免能力总线偶发不可达时无限 loading 黑屏。
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} 请求超时（${ms}ms）`)), ms)
    ),
  ])
}

function CardTitle({
  icon,
  title,
  legend,
}: {
  icon: ReactNode
  title: string
  legend?: ReactNode
}) {
  return (
    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
      <Box
        sx={{
          color: 'primary.main',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          borderRadius: 1.5,
          bgcolor: 'action.hover',
        }}
      >
        {icon}
      </Box>
      <Typography variant="subtitle2">{title}</Typography>
      <Box sx={{ flex: 1 }} />
      {legend && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>{legend}</Box>
      )}
    </Stack>
  )
}

function DashboardSkeleton() {
  return (
    <Box>
      <Skeleton variant="text" width={280} height={36} />
      <Skeleton variant="text" width={220} height={20} sx={{ mb: 2 }} />
      <Grid container spacing={2} mb={2}>
        {[0, 1, 2, 3].map((i) => (
          <Grid item xs={12} sm={6} md={3} key={i}>
            <Skeleton variant="rounded" height={96} />
          </Grid>
        ))}
      </Grid>
      <Grid container spacing={2}>
        <Grid item xs={12} md={8}>
          <Skeleton variant="rounded" height={300} />
        </Grid>
        <Grid item xs={12} md={4}>
          <Skeleton variant="rounded" height={300} />
        </Grid>
        <Grid item xs={12} md={4}>
          <Skeleton variant="rounded" height={280} />
        </Grid>
        <Grid item xs={12} md={4}>
          <Skeleton variant="rounded" height={280} />
        </Grid>
        <Grid item xs={12} md={4}>
          <Skeleton variant="rounded" height={280} />
        </Grid>
      </Grid>
    </Box>
  )
}

export default function Dashboard() {
  const theme = useTheme()
  const chartColors = useMemo(
    () => Object.values(tokens.color[theme.palette.mode].chart) as string[],
    [theme.palette.mode]
  )
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // AI 巡检报告
  const [reportOpen, setReportOpen] = useState(false)
  const [report, setReport] = useState('')
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState('')

  const genReport = async () => {
    setReportOpen(true)
    setReportLoading(true)
    setReportError('')
    setReport('')
    try {
      const r = await api.ai.report()
      setReport(r.report)
    } catch (e) {
      setReportError((e as Error).message || 'AI 报告生成失败')
    } finally {
      setReportLoading(false)
    }
  }

  useEffect(() => {
    (window as unknown as { __opsDash?: unknown }).__opsDash = { phase: 'loading' }
    // 三路 API 独立加载：单路失败不吞掉其余数据，仅提示该路错误
    withTimeout(api.dashboard.summary(), 10000, '仪表盘摘要')
      .then((s) => {
        setSummary(s)
        ;(window as unknown as { __opsDash?: unknown }).__opsDash = { phase: 'ok' }
      })
      .catch((e) => {
        setError((e as Error)?.message || '仪表盘摘要加载失败')
        ;(window as unknown as { __opsDash?: unknown }).__opsDash = { phase: 'error', error: (e as Error)?.message }
      })
      .finally(() => setLoading(false))
    withTimeout(api.alerts.list(), 10000, '告警列表')
      .then(setAlerts)
      .catch(() => {}) // 告警列表失败不影响主体，Dashboard 摘要内已含 recentAlerts
    withTimeout(api.assets.list(), 10000, '资产列表')
      .then(setAssets)
      .catch(() => {})
  }, [])

  const avgHealth = useMemo(
    () =>
      assets.length
        ? Math.round(assets.reduce((acc, a) => acc + a.healthScore, 0) / assets.length)
        : 0,
    [assets]
  )

  // 告警级别分布（真实数据）
  const levelData = useMemo(() => {
    const counts = LEVEL_ORDER.map((lv) => alerts.filter((a) => a.level === lv).length)
    return LEVEL_ORDER.map((lv, i) => ({
      id: lv,
      value: counts[i],
      label: lv,
      color: [theme.palette.error.main, theme.palette.warning.main, theme.palette.info.main, theme.palette.success.main][i],
    }))
  }, [alerts, theme.palette])

  // 资源类型覆盖（真实数据）
  const typeData = useMemo(() => {
    const types = ['server', 'middleware', 'container', 'database', 'network'] as const
    const labels: Record<string, string> = {
      server: '主机',
      middleware: '中间件',
      container: '容器',
      database: '数据库',
      network: '网络',
    }
    const counts = types.map((t) => assets.filter((a) => a.type === t).length)
    return { labels: types.map((t) => labels[t]), counts }
  }, [assets])

  // TOP 资产（按健康分取前 6）
  const topAssets = useMemo(
    () => [...assets].sort((a, b) => b.healthScore - a.healthScore).slice(0, 6),
    [assets]
  )

  // 告警趋势（近 7 天，真实数据）：按 createdAt 聚合每日新增 / 已恢复
  const trend = useMemo(() => {
    const days: string[] = []
    const created: number[] = []
    const resolved: number[] = []
    const now = new Date()
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const label = i === 0 ? '今天' : i === 1 ? '昨天' : `${d.getMonth() + 1}/${d.getDate()}`
      days.push(label)
      created.push(alerts.filter((a) => a.createdAt.slice(0, 10) === key).length)
      resolved.push(
        alerts.filter(
          (a) => a.state === 'resolved' && (a.resolvedAt || a.createdAt).slice(0, 10) === key
        ).length
      )
    }
    return { days, created, resolved }
  }, [alerts])

  // 告警级别分布：过滤 0 值，避免环图出现空白扇区，图例更简洁
  const visibleLevelData = useMemo(
    () => levelData.filter((d) => d.value > 0),
    [levelData]
  )

  const alertCols: Column<Alert>[] = [
    {
      key: 'level',
      label: '级别',
      render: (r) => <StatusBadge status={levelStatus(r.level)} label={r.level} />,
    },
    { key: 'title', label: '标题' },
    {
      key: 'state',
      label: '状态',
      render: (r) => (
        <StatusBadge
          status={r.state === 'active' ? 'error' : r.state === 'ack' ? 'warn' : r.state === 'silenced' ? 'unknown' : 'ok'}
          label={ALERT_STATE_LABEL[r.state] ?? r.state}
        />
      ),
    },
    {
      key: 'createdAt',
      label: '时间',
      render: (r) => new Date(r.createdAt).toLocaleString(),
    },
  ]

  const assetCols: Column<Asset>[] = [
    { key: 'name', label: '资产' },
    { key: 'type', label: '类型' },
    {
      key: 'status',
      label: '健康',
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'healthScore',
      label: '健康分',
      align: 'right',
      render: (r) => r.healthScore,
    },
  ]

  if (loading) return <DashboardSkeleton />

  if (!summary) {
    return (
      <Box>
        <PageHeader title="态势巡检仪表盘" subtitle="资产可见 · 状态可查 · 风险可预警" />
        <MuiAlert severity="error" sx={{ mt: 2 }}>
          {error || '加载仪表盘失败'}
        </MuiAlert>
      </Box>
    )
  }

  const pieHasData = visibleLevelData.length > 0
  const barHasData = typeData.counts.some((c) => c > 0)

  // 自定义趋势图图例，放在卡片标题右侧，避免底部图例被容器截断
  const trendLegend = (
    <Stack direction="row" spacing={1.5} alignItems="center">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Box
          sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: chartColors[0] }}
        />
        <Typography variant="caption" color="text.secondary">
          新增告警
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Box
          sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: chartColors[2] }}
        />
        <Typography variant="caption" color="text.secondary">
          已恢复
        </Typography>
      </Box>
    </Stack>
  )

  return (
    <Box>
      <PageHeader
        title="态势巡检仪表盘"
        subtitle="资产可见 · 状态可查 · 风险可预警"
        actions={
          <Button
            variant="outlined"
            startIcon={reportLoading ? <CircularProgress size={16} color="inherit" /> : <IconAi />}
            onClick={() => void genReport()}
            disabled={reportLoading}
          >
            {reportLoading ? '生成中…' : 'AI 巡检报告'}
          </Button>
        }
      />

      {/* KPI 概览 */}
      <Grid container spacing={2} mb={2}>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard title="资产总数" value={summary.totalAssets} sub="已纳管" icon={<Storage />} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard
            title="活跃告警"
            value={summary.activeAlerts}
            sub="待处理"
            icon={<Notifications />}
            color={theme.palette.error.main}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard
            title="今日巡检"
            value={summary.patrolsToday}
            sub="任务执行"
            icon={<Schedule />}
            color={theme.palette.warning.main}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard
            title="平均健康分"
            value={avgHealth}
            sub="满分 100"
            icon={<MonitorHeart />}
            color={theme.palette.success.main}
          />
        </Grid>
      </Grid>

      {/* 趋势 + 级别分布 */}
      <Grid container spacing={2} mb={2}>
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <CardTitle
                icon={<ShowChart fontSize="small" />}
                title="告警趋势（近 7 天）"
                legend={trendLegend}
              />
              <Divider sx={{ mb: 1.5 }} />
              <LineChart
                height={260}
                margin={{ left: 40, right: 24, top: 16, bottom: 24 }}
                xAxis={[
                  {
                    scaleType: 'point',
                    data: trend.days,
                    tickLabelStyle: { fill: theme.palette.text.secondary, fontSize: 11 },
                  },
                ]}
                yAxis={[
                  {
                    tickLabelStyle: { fill: theme.palette.text.secondary, fontSize: 11 },
                  },
                ]}
                series={[
                  {
                    data: trend.created,
                    label: '新增告警',
                    color: chartColors[0],
                    area: true,
                    showMark: true,
                    valueFormatter: (v) => (v == null ? '' : `${v} 条`),
                  },
                  {
                    data: trend.resolved,
                    label: '已恢复',
                    color: chartColors[2],
                    showMark: true,
                    valueFormatter: (v) => (v == null ? '' : `${v} 条`),
                  },
                ]}
                grid={{ horizontal: true, vertical: false }}
                slotProps={{
                  legend: { hidden: true },
                  area: { fillOpacity: 0.2 },
                  line: { strokeWidth: 3 },
                  axisContent: {
                    sx: {
                      bgcolor: theme.palette.background.paper,
                      border: `1px solid ${theme.palette.divider}`,
                      color: theme.palette.text.primary,
                      boxShadow: theme.shadows[4],
                    },
                  },
                }}
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <CardTitle icon={<PieChartIcon fontSize="small" />} title="告警级别分布" />
              <Divider sx={{ mb: 1.5 }} />
              {pieHasData ? (
                <Box sx={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                  <PieChart
                    height={240}
                    margin={{ left: 8, right: 8, top: 8, bottom: 48 }}
                    series={[
                      {
                        data: visibleLevelData,
                        innerRadius: 48,
                        outerRadius: 92,
                        paddingAngle: 3,
                        cornerRadius: 4,
                        arcLabel: (item) => `${item.label}`,
                        highlightScope: { faded: 'global', highlighted: 'item' },
                        faded: { innerRadius: 48, additionalRadius: -4, color: 'gray' },
                      },
                    ]}
                    slotProps={{
                      legend: {
                        direction: 'row',
                        position: { vertical: 'bottom', horizontal: 'middle' },
                        labelStyle: { fill: theme.palette.text.primary, fontSize: 12 },
                        itemGap: 16,
                      },
                    }}
                  />
                </Box>
              ) : (
                <EmptyState text="暂无告警" icon={<Notifications />} />
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* 资源覆盖 + 整体健康 + TOP 资产 */}
      <Grid container spacing={2} mb={2}>
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <CardTitle icon={<BarIcon fontSize="small" />} title="资源类型覆盖" />
              <Divider sx={{ mb: 1.5 }} />
              {barHasData ? (
                <BarChart
                  height={240}
                  margin={{ left: 36, right: 24, top: 16, bottom: 36 }}
                  xAxis={[
                    {
                      scaleType: 'band',
                      data: typeData.labels,
                      tickLabelStyle: { fill: theme.palette.text.secondary, fontSize: 11 },
                    },
                  ]}
                  yAxis={[
                    {
                      tickLabelStyle: { fill: theme.palette.text.secondary, fontSize: 11 },
                    },
                  ]}
                  series={[{ data: typeData.counts, label: '资产数', color: chartColors[3] }]}
                  grid={{ horizontal: true, vertical: false }}
                  slotProps={{ legend: { hidden: true } }}
                />
              ) : (
                <EmptyState text="暂无资产" icon={<Storage />} />
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <CardTitle icon={<MonitorHeart fontSize="small" />} title="整体健康" />
              <Divider sx={{ mb: 1.5 }} />
              <Box display="flex" justifyContent="center" py={1}>
                <HealthRing score={avgHealth} size={150} label="健康分" />
              </Box>
              <Stack direction="row" justifyContent="space-around" sx={{ mt: 1 }}>
                <Box textAlign="center">
                  <Typography variant="h6" sx={{ color: theme.palette.success.main }}>
                    {summary.healthDistribution.ok}
                  </Typography>
                  <Stack direction="row" spacing={0.5} justifyContent="center" alignItems="center">
                    <CheckCircle sx={{ fontSize: 14, color: theme.palette.success.main }} />
                    <Typography variant="caption" color="text.secondary">
                      正常
                    </Typography>
                  </Stack>
                </Box>
                <Box textAlign="center">
                  <Typography variant="h6" sx={{ color: theme.palette.warning.main }}>
                    {summary.healthDistribution.warn}
                  </Typography>
                  <Stack direction="row" spacing={0.5} justifyContent="center" alignItems="center">
                    <Warning sx={{ fontSize: 14, color: theme.palette.warning.main }} />
                    <Typography variant="caption" color="text.secondary">
                      警告
                    </Typography>
                  </Stack>
                </Box>
                <Box textAlign="center">
                  <Typography variant="h6" sx={{ color: theme.palette.error.main }}>
                    {summary.healthDistribution.error}
                  </Typography>
                  <Stack direction="row" spacing={0.5} justifyContent="center" alignItems="center">
                    <ErrorIcon sx={{ fontSize: 14, color: theme.palette.error.main }} />
                    <Typography variant="caption" color="text.secondary">
                      严重
                    </Typography>
                  </Stack>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <CardTitle icon={<Insights fontSize="small" />} title="TOP 资产（健康分）" />
              <Divider sx={{ mb: 1.5 }} />
              {topAssets.length > 0 ? (
                <BarChart
                  layout="horizontal"
                  height={240}
                  margin={{ left: 80, right: 24, top: 16, bottom: 24 }}
                  yAxis={[
                    {
                      scaleType: 'band',
                      data: topAssets.map((a) => a.name),
                      tickLabelStyle: { fill: theme.palette.text.secondary, fontSize: 11 },
                    },
                  ]}
                  xAxis={[
                    {
                      min: 0,
                      max: 100,
                      tickLabelStyle: { fill: theme.palette.text.secondary, fontSize: 11 },
                    },
                  ]}
                  series={[
                    {
                      data: topAssets.map((a) => a.healthScore),
                      label: '健康分',
                      color: chartColors[0],
                    },
                  ]}
                  grid={{ horizontal: false, vertical: true }}
                  slotProps={{ legend: { hidden: true } }}
                />
              ) : (
                <EmptyState text="暂无资产" icon={<Storage />} />
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* 明细表 */}
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <CardTitle icon={<Notifications fontSize="small" />} title="最近告警" />
              <Divider sx={{ mb: 1.5 }} />
              {alerts.length === 0 ? (
                <EmptyState text="暂无告警" icon={<Notifications />} />
              ) : (
                <DataTable columns={alertCols} rows={alerts.slice(0, 6)} />
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <CardTitle icon={<Storage fontSize="small" />} title="资产健康榜" />
              <Divider sx={{ mb: 1.5 }} />
              <DataTable columns={assetCols} rows={assets} emptyText="暂无资产" />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* AI 巡检报告 */}
      <Dialog open={reportOpen} onClose={() => setReportOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconAi sx={{ color: theme.palette.primary.main }} />
          AI 智能巡检报告
          <Box sx={{ flexGrow: 1 }} />
          <IconButton size="small" onClick={() => setReportOpen(false)}>
            <IconClose fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {reportLoading ? (
            <Box display="flex" flexDirection="column" alignItems="center" gap={1.5} py={6}>
              <CircularProgress size={28} />
              <Typography variant="body2" color="text.secondary">AI 正在基于平台数据生成巡检报告…</Typography>
            </Box>
          ) : reportError ? (
            <Box py={3}>
              <Typography variant="body2" color="error" sx={{ mb: 1 }}>{reportError}</Typography>
              <Typography variant="caption" color="text.secondary">可在「设置 → AI 大模型」检查配置后重试。</Typography>
            </Box>
          ) : (
            <Typography
              variant="body2"
              component="div"
              sx={{ lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word', '& code': { fontFamily: 'var(--font-mono)', bgcolor: 'action.hover', px: 0.5, borderRadius: 0.5, fontSize: 13 } }}
            >
              {report}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReportOpen(false)}>关闭</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
