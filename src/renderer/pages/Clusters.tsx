import { useEffect, useState } from 'react'
import {
  Grid,
  Box,
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
} from '@mui/material'
import { Dns, PlayArrow, Groups, SmartToy } from '@mui/icons-material'
import { api } from '../../capabilities/bus'
import type {
  ClusterInfo,
  ClusterDetail,
  Status,
  AgentStatus,
} from '@shared/types'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import KpiCard from '../components/KpiCard'
import DataTable, { Column } from '../components/DataTable'
import EmptyState from '../components/EmptyState'

function readyStatus(ready: boolean): Status {
  return ready ? 'ok' : 'error'
}
function agentStatus(s: string): Status {
  if (s === 'error') return 'error'
  if (s === 'warn') return 'warn'
  return 'ok'
}

export default function Clusters() {
  const theme = useTheme()
  const [clusters, setClusters] = useState<ClusterInfo[]>([])
  const [selected, setSelected] = useState<ClusterDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.clusters
      .list()
      .then((c) => {
        setClusters(c)
        if (c.length) select(c[0].id)
      })
      .catch((e) => setError((e as Error).message || '加载集群失败'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const select = (id: string) => {
    setLoading(true)
    setError('')
    api.clusters
      .get(id)
      .then(setSelected)
      .catch((e) => setError((e as Error).message || '加载集群详情失败'))
      .finally(() => setLoading(false))
  }

  const scan = async (id: string) => {
    setScanning(true)
    setError('')
    try {
      const d = await api.clusters.scan(id)
      setSelected(d)
    } catch (e) {
      setError((e as Error).message || '协同巡检失败')
    } finally {
      setScanning(false)
    }
  }

  if (loading && !selected) {
    return (
      <Box display="flex" justifyContent="center" py={10}>
        <CircularProgress />
      </Box>
    )
  }

  const nodeCols: Column<ClusterDetail['nodes'][number]>[] = [
    { key: 'name', label: '节点' },
    { key: 'role', label: '角色' },
    {
      key: 'ready',
      label: '就绪',
      render: (r) => <StatusBadge status={readyStatus(r.ready)} label={r.ready ? 'Ready' : 'NotReady'} />,
    },
    { key: 'cpu', label: 'CPU' },
    { key: 'memory', label: '内存' },
  ]
  const wlCols: Column<ClusterDetail['workloads'][number]>[] = [
    { key: 'name', label: '名称' },
    { key: 'kind', label: '类型' },
    { key: 'namespace', label: '命名空间' },
    { key: 'replicas', label: '副本' },
    { key: 'status', label: '状态' },
  ]
  const agentCols: Column<AgentStatus>[] = [
    { key: 'name', label: '智能体' },
    { key: 'role', label: '角色' },
    { key: 'status', label: '状态', render: (r) => <StatusBadge status={agentStatus(r.status)} /> },
  ]

  return (
    <Box>
      <PageHeader
        title="K8s 集群运维"
        subtitle="集群健康 / 节点 / 工作负载 / 多智能体协同"
        actions={
          selected && (
            <Button
              variant="contained"
              startIcon={scanning ? <CircularProgress size={16} color="inherit" /> : <PlayArrow />}
              disabled={scanning}
              onClick={() => scan(selected.cluster.id)}
            >
              {scanning ? '巡检中…' : '协同巡检'}
            </Button>
          )
        }
      />

      {error && (
        <MuiAlert severity="error" sx={{ mb: 2 }}>
          {error}
        </MuiAlert>
      )}

      <Stack direction="row" spacing={1} mb={2} flexWrap="wrap" useFlexGap>
        {clusters.map((c) => (
          <Chip
            key={c.id}
            label={`${c.name}（${c.nodeCount} 节点）`}
            color={selected?.cluster.id === c.id ? 'primary' : 'default'}
            variant={selected?.cluster.id === c.id ? 'filled' : 'outlined'}
            onClick={() => select(c.id)}
            sx={{ cursor: 'pointer' }}
          />
        ))}
      </Stack>

      {!selected ? (
        <Card>
          <CardContent>
            <EmptyState text="暂无集群" icon={<Dns />} />
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <KpiCard
              title="节点数"
              value={selected.cluster.nodeCount}
              icon={<Dns />}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <KpiCard
              title="健康分"
              value={selected.cluster.healthScore}
              icon={<Groups />}
              color={theme.palette.success.main}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <KpiCard
              title="智能体"
              value={selected.agents.length}
              icon={<SmartToy />}
              color={theme.palette.info.main}
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" gutterBottom>
                  节点
                </Typography>
                <Divider sx={{ mb: 1.5 }} />
                <DataTable columns={nodeCols} rows={selected.nodes} emptyText="无节点" />
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" gutterBottom>
                  工作负载
                </Typography>
                <Divider sx={{ mb: 1.5 }} />
                <DataTable columns={wlCols} rows={selected.workloads} emptyText="无工作负载" />
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" gutterBottom>
                  多智能体协同状态
                </Typography>
                <Divider sx={{ mb: 1.5 }} />
                <DataTable columns={agentCols} rows={selected.agents} emptyText="无智能体" />
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
    </Box>
  )
}
