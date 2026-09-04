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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  IconButton,
  Tooltip,
  Paper,
  LinearProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material'
import {
  Dns,
  PlayArrow,
  Groups,
  SmartToy,
  Delete,
  Edit,
  Add as IconAdd,
  Troubleshoot,
  CheckCircle,
  Cancel,
} from '@mui/icons-material'
import { api } from '../../capabilities/bus'
import type {
  ClusterInfo,
  ClusterDetail,
  ClusterDiagItem,
  ClusterServiceInfo,
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

type AuthType = 'token' | 'kubeconfig'

export default function Clusters() {
  const theme = useTheme()
  const [clusters, setClusters] = useState<ClusterInfo[]>([])
  const [selected, setSelected] = useState<ClusterDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')

  // 连接自检：定位失败原因（endpoint/DNS/端口/证书/凭据/API Server 逐项检测）
  const [diagOpen, setDiagOpen] = useState(false)
  const [diagItems, setDiagItems] = useState<ClusterDiagItem[] | null>(null)
  const [diagnosing, setDiagnosing] = useState(false)
  const [diagTarget, setDiagTarget] = useState<ClusterInfo | null>(null)
  const [lastFailedId, setLastFailedId] = useState('')

  // 删除确认
  const [confirmDelete, setConfirmDelete] = useState<ClusterInfo | null>(null)

  // 编辑对话框状态
  const [editOpen, setEditOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ClusterInfo | null>(null)
  const [editName, setEditName] = useState('')
  const [editEndpoint, setEditEndpoint] = useState('')
  const [saving, setSaving] = useState(false)

  // 新建集群对话框
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({
    name: '',
    endpoint: '',
    authType: 'token' as AuthType,
    token: '',
    kubeconfig: '',
  })
  const [creating, setCreating] = useState(false)

  const loadList = () => {
    api.clusters
      .list()
      .then((c) => {
        setClusters(c)
        // 若已选中集群被删除，清空选中
        setSelected((prev) => (prev && c.some((x) => x.id === prev.cluster.id) ? prev : null))
      })
      .catch((e) => setError((e as Error).message || '加载集群失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const select = (id: string) => {
    setDetailLoading(true)
    setError('')
    api.clusters
      .get(id)
      .then((d) => {
        setSelected(d)
        setLastFailedId('')
      })
      .catch((e) => {
        setError((e as Error).message || '加载集群详情失败')
        setLastFailedId(id)
      })
      .finally(() => setDetailLoading(false))
  }

  const runDiagnose = async (c?: ClusterInfo | null) => {
    if (!c) return
    setDiagTarget(c)
    setDiagOpen(true)
    setDiagItems(null)
    setDiagnosing(true)
    try {
      const r = await api.clusters.diagnose(c.id)
      setDiagItems(r.items)
    } catch (e) {
      setDiagItems([{ item: '自检执行', ok: false, detail: (e as Error).message || '自检请求失败，请确认后端服务正常' }])
    } finally {
      setDiagnosing(false)
    }
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

  const openEdit = (c: ClusterInfo) => {
    setEditTarget(c)
    setEditName(c.name)
    setEditEndpoint(c.endpoint)
    setEditOpen(true)
  }

  const onSaveEdit = async () => {
    if (!editTarget) return
    setSaving(true)
    setError('')
    try {
      await api.clusters.update(editTarget.id, { name: editName, endpoint: editEndpoint })
      setEditOpen(false)
      loadList()
      if (selected) select(selected.cluster.id)
    } catch (e) {
      setError((e as Error).message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const onDelete = (c: ClusterInfo) => {
    setConfirmDelete(c)
  }

  const doDelete = async () => {
    if (!confirmDelete) return
    setError('')
    try {
      await api.clusters.remove(confirmDelete.id)
      setConfirmDelete(null)
      loadList()
    } catch (e) {
      setError((e as Error).message || '删除失败')
    }
  }

  // 新建集群：内联创建 k8s 凭据（token / kubeconfig），再建集群并自动连接
  const onCreateCluster = async () => {
    const { name, endpoint, authType, token, kubeconfig } = createForm
    if (!name.trim() || !endpoint.trim()) {
      setError('名称与 API Endpoint 必填')
      return
    }
    if (authType === 'token' && !token.trim()) {
      setError('Token 认证需填写 Service Account Token')
      return
    }
    if (authType === 'kubeconfig' && !kubeconfig.trim()) {
      setError('Kubeconfig 认证需粘贴 kubeconfig 内容')
      return
    }
    setCreating(true)
    setError('')
    try {
      const cred = await api.credentials.create({
        name: `${name} k8s 凭据`,
        kind: 'k8s',
        endpoint: endpoint.trim(),
        token: authType === 'token' ? token.trim() : undefined,
        kubeconfig: authType === 'kubeconfig' ? kubeconfig.trim() : undefined,
      })
      const cluster = await api.clusters.create({
        name: name.trim(),
        endpoint: endpoint.trim(),
        credentialId: cred.id,
        authType,
      })
      setCreateOpen(false)
      setCreateForm({ name: '', endpoint: '', authType: 'token', token: '', kubeconfig: '' })
      loadList()
      select(cluster.id)
    } catch (e) {
      setError((e as Error).message || '创建集群失败')
    } finally {
      setCreating(false)
    }
  }

  if (loading && clusters.length === 0) {
    return (
      <Box display="flex" justifyContent="center" py={10}>
        <CircularProgress />
      </Box>
    )
  }

  // 资源使用率进度条：metrics-server 可用时按容量百分比展示，超 80% 警示
  const usageBar = (pct: number | undefined, fallback: string) =>
    pct === undefined ? (
      <Typography variant="body2" color="text.secondary">
        {fallback}
      </Typography>
    ) : (
      <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 120 }}>
        <LinearProgress
          variant="determinate"
          value={pct}
          color={pct >= 80 ? 'error' : pct >= 60 ? 'warning' : 'primary'}
          sx={{ flex: 1, height: 6, borderRadius: 3 }}
        />
        <Typography variant="caption" sx={{ minWidth: 34, fontFamily: 'monospace' }}>
          {pct}%
        </Typography>
      </Stack>
    )

  const nodeCols: Column<ClusterDetail['nodes'][number]>[] = [
    { key: 'name', label: '节点' },
    { key: 'role', label: '角色' },
    {
      key: 'ready',
      label: '就绪',
      render: (r) => <StatusBadge status={readyStatus(r.ready)} label={r.ready ? 'Ready' : 'NotReady'} />,
    },
    { key: 'cpu', label: 'CPU', render: (r) => usageBar(r.cpuUsagePct, r.cpu) },
    { key: 'memory', label: '内存', render: (r) => usageBar(r.memoryUsagePct, r.memory) },
  ]
  const wlCols: Column<ClusterDetail['workloads'][number]>[] = [
    { key: 'name', label: '名称' },
    { key: 'kind', label: '类型' },
    { key: 'namespace', label: '命名空间' },
    { key: 'replicas', label: '副本' },
    { key: 'status', label: '状态' },
  ]
  const svcCols: Column<ClusterServiceInfo>[] = [
    { key: 'name', label: '服务' },
    { key: 'namespace', label: '命名空间' },
    { key: 'type', label: '类型' },
    { key: 'clusterIP', label: 'ClusterIP' },
    { key: 'ports', label: '端口' },
    {
      key: 'readyEndpoints',
      label: '就绪端点',
      render: (r) => (r.readyEndpoints < 0 ? '—' : String(r.readyEndpoints)),
    },
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
          <Stack direction="row" spacing={1}>
            {(selected || lastFailedId) && (
              <Button
                variant="outlined"
                color={lastFailedId && !selected ? 'warning' : 'inherit'}
                startIcon={diagnosing ? <CircularProgress size={16} color="inherit" /> : <Troubleshoot />}
                disabled={diagnosing}
                onClick={() => runDiagnose(selected?.cluster || clusters.find((c) => c.id === lastFailedId))}
              >
                {diagnosing ? '自检中…' : '连接自检'}
              </Button>
            )}
            {selected && (
              <Button
                variant="outlined"
                startIcon={scanning ? <CircularProgress size={16} color="inherit" /> : <PlayArrow />}
                disabled={scanning}
                onClick={() => scan(selected.cluster.id)}
              >
                {scanning ? '巡检中…' : '协同巡检'}
              </Button>
            )}
            <Button variant="contained" startIcon={<IconAdd />} onClick={() => setCreateOpen(true)}>
              添加集群
            </Button>
          </Stack>
        }
      />

      {error && (
        <MuiAlert
          severity="error"
          sx={{ mb: 2 }}
          onClose={() => setError('')}
          action={
            lastFailedId ? (
              <Button
                color="error"
                size="small"
                startIcon={<Troubleshoot />}
                disabled={diagnosing}
                onClick={() => runDiagnose(clusters.find((c) => c.id === lastFailedId))}
              >
                一键自检
              </Button>
            ) : undefined
          }
        >
          {error}
        </MuiAlert>
      )}

      <Stack direction="row" spacing={1} mb={2} flexWrap="wrap" useFlexGap alignItems="center">
        {clusters.map((c) => (
          <Box key={c.id} sx={{ display: 'inline-flex', alignItems: 'center' }}>
            <Chip
              label={`${c.name}（${c.nodeCount} 节点）`}
              color={selected?.cluster.id === c.id ? 'primary' : 'default'}
              variant={selected?.cluster.id === c.id ? 'filled' : 'outlined'}
              onClick={() => select(c.id)}
              onDelete={() => onDelete(c)}
              deleteIcon={<Delete />}
              sx={{ cursor: 'pointer' }}
            />
            <Tooltip title="编辑集群">
              <IconButton size="small" onClick={() => openEdit(c)}>
                <Edit fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        ))}
      </Stack>

      {!selected ? (
        <Card>
          <CardContent>
            <EmptyState
              text={clusters.length === 0 ? '暂无集群' : '点击上方集群查看详情'}
              description={
                clusters.length === 0
                  ? '通过「添加集群」接入真实 K8s 集群（支持 Token / Kubeconfig 认证），即可查看节点与工作负载'
                  : '请点击列表中的集群查看节点与工作负载详情'
              }
              icon={<Dns />}
              action={
                clusters.length === 0 ? (
                  <Button variant="contained" startIcon={<IconAdd />} onClick={() => setCreateOpen(true)}>
                    添加集群
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : detailLoading ? (
        <Box display="flex" justifyContent="center" py={10}>
          <CircularProgress />
        </Box>
      ) : (
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <KpiCard title="节点数" value={selected.cluster.nodeCount} icon={<Dns />} />
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
                  服务（Service / 端点就绪度）
                </Typography>
                <Divider sx={{ mb: 1.5 }} />
                <DataTable
                  columns={svcCols}
                  rows={selected.services || []}
                  emptyText="无服务（或集群未授权 list service）"
                />
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

      {/* 连接自检结果 */}
      <Dialog open={diagOpen} onClose={() => setDiagOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>集群连接自检{diagTarget ? ` · ${diagTarget.name}` : ''}</DialogTitle>
        <DialogContent>
          {diagnosing ? (
            <Box display="flex" justifyContent="center" py={6}>
              <Stack spacing={2} alignItems="center">
                <CircularProgress />
                <Typography variant="body2" color="text.secondary">
                  正在逐项检测 endpoint / DNS / 端口 / 证书 / 凭据 / API Server…
                </Typography>
              </Stack>
            </Box>
          ) : (
            <List disablePadding>
              {(diagItems || []).map((it) => (
                <ListItem key={it.item} sx={{ px: 0 }} secondaryAction={undefined}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    {it.ok ? <CheckCircle color="success" /> : <Cancel color="error" />}
                  </ListItemIcon>
                  <ListItemText primary={it.item} secondary={it.detail} />
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDiagOpen(false)}>关闭</Button>
          <Button
            variant="contained"
            disabled={diagnosing}
            onClick={() => runDiagnose(diagTarget)}
          >
            重新自检
          </Button>
        </DialogActions>
      </Dialog>

      {/* 编辑集群 */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>编辑集群</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="名称" fullWidth value={editName} onChange={(e) => setEditName(e.target.value)} />
            <TextField
              label="API Endpoint"
              fullWidth
              value={editEndpoint}
              onChange={(e) => setEditEndpoint(e.target.value)}
              placeholder="https://k8s-apiserver:6443"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>取消</Button>
          <Button variant="contained" disabled={saving || !editName || !editEndpoint} onClick={onSaveEdit}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 删除确认 */}
      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          确定要删除集群「{confirmDelete?.name}」吗？此操作不可恢复。
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)}>取消</Button>
          <Button color="error" variant="contained" onClick={() => void doDelete()}>删除</Button>
        </DialogActions>
      </Dialog>

      {/* 添加集群 */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>添加 K8s 集群</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="集群名称"
              fullWidth
              value={createForm.name}
              onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="如 production-cluster"
            />
            <TextField
              label="API Endpoint"
              fullWidth
              value={createForm.endpoint}
              onChange={(e) => setCreateForm((f) => ({ ...f, endpoint: e.target.value }))}
              placeholder="https://k8s-apiserver:6443"
            />
            <TextField
              label="认证方式"
              select
              fullWidth
              value={createForm.authType}
              onChange={(e) => setCreateForm((f) => ({ ...f, authType: e.target.value as AuthType }))}
            >
              <MenuItem value="token">Service Account Token</MenuItem>
              <MenuItem value="kubeconfig">Kubeconfig 文件内容</MenuItem>
            </TextField>
            {createForm.authType === 'token' ? (
              <TextField
                label="Service Account Token"
                fullWidth
                multiline
                minRows={3}
                value={createForm.token}
                onChange={(e) => setCreateForm((f) => ({ ...f, token: e.target.value }))}
                placeholder="eyJhbGciOiJSUzI1NiIs..."
              />
            ) : (
              <TextField
                label="Kubeconfig (YAML)"
                fullWidth
                multiline
                minRows={6}
                value={createForm.kubeconfig}
                onChange={(e) => setCreateForm((f) => ({ ...f, kubeconfig: e.target.value }))}
                placeholder={'apiVersion: v1\nkind: Config\nclusters:\n  - cluster:\n      server: https://...\n    name: ...'}
                sx={{ fontFamily: 'monospace' }}
              />
            )}
            <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'action.hover' }}>
              <Typography variant="caption" color="text.secondary">
                认证信息将被 AES-256-GCM 加密存储，仅用于集群连接，绝不明文落盘。连接失败时会给出分级排查指引。
              </Typography>
            </Paper>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>取消</Button>
          <Button variant="contained" disabled={creating} onClick={onCreateCluster}>
            {creating ? '创建中…' : '创建并连接'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
