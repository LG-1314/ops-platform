import { useEffect, useState } from 'react'
import {
  Box,
  Stack,
  TextField,
  Button,
  InputAdornment,
  CircularProgress,
  Alert as MuiAlert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  IconButton,
  Tooltip,
  useTheme,
} from '@mui/material'
import { Search, Refresh, Add, DeleteOutline, Radar } from '@mui/icons-material'
import { api } from '../../capabilities/bus'
import type { Asset, AssetType, Status } from '@shared/types'
import DataTable, { Column } from '../components/DataTable'
import StatusBadge from '../components/StatusBadge'
import PageHeader from '../components/PageHeader'

const TYPE_LABEL: Record<AssetType, string> = {
  server: '服务器',
  middleware: '中间件',
  container: '容器',
  database: '数据库',
  network: '网络',
}

interface AddForm {
  name: string
  type: AssetType
  host: string
  ip: string
  port: string
  tags: string
}

export default function Assets() {
  const theme = useTheme()
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [discovering, setDiscovering] = useState(false)
  const [probingId, setProbingId] = useState('')
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [type, setType] = useState('')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<AddForm>({ name: '', type: 'server', host: '', ip: '', port: '', tags: '' })
  const [submitting, setSubmitting] = useState(false)

  const load = () => {
    setLoading(true)
    setError('')
    return api.assets
      .list(q || undefined, (type || undefined) as AssetType | undefined)
      .then(setAssets)
      .catch((e) => setError((e as Error).message || '加载资产失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 自动刷新（保留当前筛选），体现监控的实时在线/离线与延迟
  useEffect(() => {
    const t = setInterval(() => {
      api.assets
        .list(q || undefined, (type || undefined) as AssetType | undefined)
        .then(setAssets)
        .catch(() => {})
    }, 15000)
    return () => clearInterval(t)
  }, [q, type])

  const discover = async () => {
    setDiscovering(true)
    setError('')
    try {
      await api.assets.discover()
      await load()
    } catch (e) {
      setError((e as Error).message || '发现资产失败')
    } finally {
      setDiscovering(false)
    }
  }

  const probeAll = async () => {
    setDiscovering(true)
    setError('')
    try {
      await api.assets.probeAll()
      await load()
    } catch (e) {
      setError((e as Error).message || '探测失败')
    } finally {
      setDiscovering(false)
    }
  }

  const probeOne = async (id: string) => {
    setProbingId(id)
    try {
      await api.assets.probe(id)
      await load()
    } catch (e) {
      setError((e as Error).message || '探测失败')
    } finally {
      setProbingId('')
    }
  }

  const removeAsset = async (id: string) => {
    try {
      await api.assets.remove(id)
      await load()
    } catch (e) {
      setError((e as Error).message || '删除失败')
    }
  }

  const openAdd = () => {
    setForm({ name: '', type: 'server', host: '', ip: '', port: '', tags: '' })
    setDialogOpen(true)
  }

  const submitAdd = async () => {
    if (!form.name.trim() || !form.host.trim()) {
      setError('名称与主机/IP 为必填')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await api.assets.create({
        name: form.name.trim(),
        type: form.type,
        host: form.host.trim(),
        ip: form.ip.trim() || undefined,
        port: form.port ? Number(form.port) : undefined,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        source: 'manual',
      })
      setDialogOpen(false)
      await load()
    } catch (e) {
      setError((e as Error).message || '添加失败')
    } finally {
      setSubmitting(false)
    }
  }

  const filtered = assets.filter((a) => {
    const okQ =
      !q ||
      a.name.includes(q) ||
      (a.ip ?? '').includes(q) ||
      (a.host ?? '').includes(q)
    const okT = !type || a.type === type
    return okQ && okT
  })

  const cols: Column<Asset>[] = [
    { key: 'name', label: '名称' },
    { key: 'type', label: '类型', render: (r) => TYPE_LABEL[r.type] },
    { key: 'host', label: '主机' },
    { key: 'ip', label: 'IP', render: (r) => r.ip ?? '—' },
    {
      key: 'reachable',
      label: '可达',
      render: (r) => {
        const color =
          r.reachable === undefined
            ? theme.palette.text.disabled
            : r.reachable
            ? theme.palette.success.main
            : theme.palette.error.main
        return (
          <span style={{ color, fontWeight: 600 }}>
            {r.reachable === undefined ? '—' : r.reachable ? '在线' : '离线'}
          </span>
        )
      },
    },
    {
      key: 'status',
      label: '健康',
      render: (r) => <StatusBadge status={r.status as Status} />,
    },
    {
      key: 'healthScore',
      label: '健康分',
      align: 'right',
      render: (r) => r.healthScore,
    },
    {
      key: 'latencyMs',
      label: '延迟',
      align: 'right',
      render: (r) => (r.latencyMs != null ? `${r.latencyMs}ms` : '—'),
    },
    {
      key: 'lastCheckAt',
      label: '最后检查',
      render: (r) => (r.lastCheckAt ? new Date(r.lastCheckAt).toLocaleTimeString() : '—'),
    },
    {
      key: 'actions',
      label: '操作',
      align: 'right',
      render: (r) => (
        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
          <Tooltip title="立即探测">
            <IconButton size="small" onClick={() => probeOne(r.id)} disabled={probingId === r.id}>
              {probingId === r.id ? <CircularProgress size={16} /> : <Radar fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Tooltip title="删除">
            <IconButton size="small" color="error" onClick={() => removeAsset(r.id)}>
              <DeleteOutline fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    },
  ]

  return (
    <Box>
      <PageHeader
        title="资产纳管"
        subtitle="服务器 / 中间件 / 容器 / 数据库 / 网络 统一台账 · 支持手动添加并实时监控存活"
        actions={
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              startIcon={discovering ? <CircularProgress size={16} color="inherit" /> : <Radar />}
              onClick={probeAll}
              disabled={discovering || loading}
            >
              {discovering ? '探测中…' : '探测全部'}
            </Button>
            <Button
              variant="outlined"
              startIcon={discovering ? <CircularProgress size={16} color="inherit" /> : <Refresh />}
              onClick={discover}
              disabled={discovering || loading}
            >
              {discovering ? '发现中…' : '发现资产'}
            </Button>
            <Button variant="contained" startIcon={<Add />} onClick={openAdd}>
              添加主机
            </Button>
          </Stack>
        }
      />

      {error && (
        <MuiAlert severity="error" sx={{ mb: 2 }}>
          {error}
        </MuiAlert>
      )}

      <Stack direction="row" spacing={1} mb={2}>
        <TextField
          size="small"
          placeholder="搜索名称 / IP / 主机"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search />
              </InputAdornment>
            ),
          }}
          sx={{ minWidth: 240 }}
        />
        <TextField
          select
          size="small"
          label="类型"
          value={type}
          onChange={(e) => setType(e.target.value)}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="">全部</MenuItem>
          {Object.entries(TYPE_LABEL).map(([k, v]) => (
            <MenuItem key={k} value={k}>
              {v}
            </MenuItem>
          ))}
        </TextField>
        <Button variant="outlined" onClick={load} disabled={loading}>
          筛选
        </Button>
      </Stack>

      {loading ? (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress />
        </Box>
      ) : (
        <DataTable columns={cols} rows={filtered} emptyText="未找到匹配资产，点击「添加主机」录入" />
      )}

      <Dialog
        open={dialogOpen}
        onClose={() => !submitting && setDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>添加主机</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              size="small"
              label="名称"
              placeholder="如 web-02"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <TextField
              select
              size="small"
              label="类型"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as AssetType })}
            >
              {Object.entries(TYPE_LABEL).map(([k, v]) => (
                <MenuItem key={k} value={k}>
                  {v}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              label="主机 / IP"
              placeholder="如 10.0.1.12 或 host.example.com"
              value={form.host}
              onChange={(e) => setForm({ ...form, host: e.target.value })}
            />
            <TextField
              size="small"
              label="IP（可选）"
              placeholder="展示用，可留空"
              value={form.ip}
              onChange={(e) => setForm({ ...form, ip: e.target.value })}
            />
            <TextField
              size="small"
              label="端口（可选）"
              placeholder="填了则 TCP 探测该端口，留空则 ping"
              value={form.port}
              onChange={(e) => setForm({ ...form, port: e.target.value })}
            />
            <TextField
              size="small"
              label="标签（可选，逗号分隔）"
              placeholder="web,nginx"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={submitting}>
            取消
          </Button>
          <Button variant="contained" onClick={submitAdd} disabled={submitting}>
            {submitting ? '添加中…' : '添加'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
