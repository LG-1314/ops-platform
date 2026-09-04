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
  Chip,
  useTheme,
} from '@mui/material'
import { Search, Refresh, Add, DeleteOutline, Radar, Edit as EditIcon, CheckBox as IconSelect, Download as IconExport, Sell as IconTag, NetworkCheck } from '@mui/icons-material'
import { useSearchParams } from 'react-router-dom'
import { api } from '../../capabilities/bus'
import type { Asset, AssetType, Status, Credential } from '@shared/types'
import DataTable, { Column } from '../components/DataTable'
import StatusBadge from '../components/StatusBadge'
import PageHeader from '../components/PageHeader'
import KpiCard from '../components/KpiCard'
import { Checkbox, Grid, FormControl, InputLabel, Select as MuiSelect, Typography } from '@mui/material'

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

type FormErrors = Partial<Record<'name' | 'host' | 'ip' | 'port' | 'tags', string>>
type ConnectionTestState =
  | { state: 'idle' }
  | { state: 'testing' }
  | { state: 'success'; message: string }
  | { state: 'failed'; message: string }

const EMPTY_FORM: AddForm = { name: '', type: 'server', host: '', ip: '', port: '', tags: '' }

function assetFormSnapshot(form: AddForm, credentialId: string): string {
  return JSON.stringify({ ...form, credentialId })
}

function validateAssetForm(form: AddForm, requireName = true): FormErrors {
  const errors: FormErrors = {}
  const host = form.host.trim()
  const port = form.port.trim()
  if (requireName && !form.name.trim()) errors.name = '请输入资产名称'
  if (!host) errors.host = '请输入主机地址'
  else if (host.length > 253 || /\s/.test(host) || !/^[a-zA-Z0-9:.-]+$/.test(host)) errors.host = '请输入 IPv4、IPv6 或合法主机名'
  if (form.ip.trim() && !/^(?:\d{1,3}\.){3}\d{1,3}$|^[0-9a-fA-F:]+$/.test(form.ip.trim())) errors.ip = '请输入有效 IP 地址，或留空'
  if (port && (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)) errors.port = '端口范围为 1 至 65535'
  const tags = form.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
  if (tags.length > 30 || tags.some((tag) => tag.length > 32)) errors.tags = '最多 30 个标签，单个标签不超过 32 个字符'
  return errors
}

export default function Assets() {
  const theme = useTheme()
  const [searchParams] = useSearchParams()
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [discovering, setDiscovering] = useState(false)
  const [probingId, setProbingId] = useState('')
  const [error, setError] = useState('')
  // 支持从知识关联跳转（?q=资产名）预填搜索
  const [q, setQ] = useState(() => searchParams.get('q') ?? '')
  const [type, setType] = useState('')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<AddForm>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [credentialId, setCredentialId] = useState('')
  const [credentialLoadError, setCredentialLoadError] = useState('')
  const [formErrors, setFormErrors] = useState<FormErrors>({})
  const [formSubmitError, setFormSubmitError] = useState('')
  const [connectionTest, setConnectionTest] = useState<ConnectionTestState>({ state: 'idle' })
  const [initialFormSnapshot, setInitialFormSnapshot] = useState('')
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  // 批量操作：勾选集合 / 批量打标签弹窗
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [tagOpen, setTagOpen] = useState(false)
  const [bulkTags, setBulkTags] = useState('')
  const [bulkTagBusy, setBulkTagBusy] = useState(false)
  const [tagFilter, setTagFilter] = useState('')
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)

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
    const target = assets.find((a) => a.id === id)
    if (!target) return
    setDeleteTarget({ id, name: target.name })
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    setError('')
    try {
      await api.assets.remove(deleteTarget.id)
      setDeleteTarget(null)
      await load()
    } catch (e) {
      setError((e as Error).message || '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  const openAdd = () => {
    setEditingId(null)
    const nextForm = { ...EMPTY_FORM }
    setForm(nextForm)
    setCredentialId('')
    setFormErrors({})
    setFormSubmitError('')
    setConnectionTest({ state: 'idle' })
    setInitialFormSnapshot(assetFormSnapshot(nextForm, ''))
    setCredentialLoadError('')
    api.credentials.list().then(setCredentials).catch(() => setCredentialLoadError('凭据列表加载失败，可稍后重试'))
    setDialogOpen(true)
  }

  const openEdit = (a: Asset) => {
    setEditingId(a.id)
    const nextForm = {
      name: a.name,
      type: a.type,
      host: a.host || '',
      ip: a.ip || '',
      port: a.port ? String(a.port) : '',
      tags: (a.tags || []).join(', '),
    }
    setForm(nextForm)
    setCredentialId(a.credentialId || '')
    setFormErrors({})
    setFormSubmitError('')
    setConnectionTest({ state: 'idle' })
    setInitialFormSnapshot(assetFormSnapshot(nextForm, a.credentialId || ''))
    setCredentialLoadError('')
    api.credentials.list().then(setCredentials).catch(() => setCredentialLoadError('凭据列表加载失败，可稍后重试'))
    setDialogOpen(true)
  }

  const isFormDirty = dialogOpen && initialFormSnapshot !== assetFormSnapshot(form, credentialId)

  const requestClose = () => {
    if (submitting) return
    if (isFormDirty) {
      setDiscardConfirmOpen(true)
      return
    }
    setDialogOpen(false)
  }

  const discardAndClose = () => {
    setDiscardConfirmOpen(false)
    setDialogOpen(false)
  }

  const submitAdd = async () => {
    const errors = validateAssetForm(form)
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      setFormSubmitError('请修正表单中的输入后再保存')
      return
    }
    setSubmitting(true)
    setFormSubmitError('')
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        host: form.host.trim(),
        ip: form.ip.trim() || undefined,
        port: form.port ? Number(form.port) : undefined,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        source: 'manual' as const,
        credentialId: credentialId || undefined,
      }
      if (editingId) await api.assets.update(editingId, payload)
      else await api.assets.create(payload)
      setDialogOpen(false)
      await load()
    } catch (e) {
      setFormSubmitError((e as Error).message || '保存失败')
    } finally {
      setSubmitting(false)
    }
  }

  const testConnection = async () => {
    const errors = validateAssetForm(form, false)
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      setConnectionTest({ state: 'failed', message: '请先修正主机、IP 或端口格式' })
      return
    }
    setConnectionTest({ state: 'testing' })
    try {
      const result = await api.assets.testConnection({ host: form.host.trim(), ip: form.ip.trim() || undefined, port: form.port ? Number(form.port) : undefined })
      setConnectionTest({
        state: result.reachable ? 'success' : 'failed',
        message: result.reachable ? `连接成功${result.latencyMs != null ? `，延迟 ${result.latencyMs}ms` : ''}` : '连接失败，请检查地址、端口或网络',
      })
    } catch (e) {
      setConnectionTest({ state: 'failed', message: (e as Error).message || '连接测试失败' })
    }
  }

  const filtered = assets.filter((a) => {
    const okQ =
      !q ||
      a.name.includes(q) ||
      (a.ip ?? '').includes(q) ||
      (a.host ?? '').includes(q)
    const okT = !type || a.type === type
    const okTag = !tagFilter || (a.tags || []).includes(tagFilter)
    return okQ && okT && okTag
  })

  // 统计：总量 / 在线 / 离线 / 异常（健康分 < 60 或 status 异常）
  const total = filtered.length
  const online = filtered.filter((a) => a.reachable === true).length
  const offline = filtered.filter((a) => a.reachable === false).length
  const abnormal = filtered.filter((a) => a.status !== 'ok' || a.healthScore < 60).length

  const allTags = Array.from(new Set(assets.flatMap((a) => a.tags || []))).sort()

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleAll = () => {
    setSelected((prev) => (prev.size === filtered.length && filtered.length > 0 ? new Set() : new Set(filtered.map((a) => a.id))))
  }

  // 批量删除（逐个调用现有单删接口，成功后清空选择）
  const bulkDelete = async () => {
    setConfirmBulkDelete(true)
  }

  const doBulkDelete = async () => {
    setConfirmBulkDelete(false)
    const ids = [...selected]
    if (!ids.length) return
    setError('')
    let failed = 0
    for (const id of ids) {
      try {
        await api.assets.remove(id)
      } catch {
        failed += 1
      }
    }
    setSelected(new Set())
    await load()
    if (failed) setError(`批量删除完成，${failed} 项失败`)
  }

  // 批量编辑标签（覆盖式写入，便于统一打标 / 归档分组）
  const bulkTag = async () => {
    if (!selected.size) return
    const tags = bulkTags.split(',').map((t) => t.trim()).filter(Boolean)
    setBulkTagBusy(true)
    setError('')
    let failed = 0
    for (const id of selected) {
      const asset = assets.find((a) => a.id === id)
      try {
        await api.assets.update(id, { tags })
      } catch {
        failed += 1
      }
      void asset
    }
    setBulkTagBusy(false)
    setTagOpen(false)
    setBulkTags('')
    setSelected(new Set())
    await load()
    if (failed) setError(`批量打标签完成，${failed} 项失败`)
  }

  // 导出 CSV（浏览器端生成下载）
  const exportCsv = () => {
    const header = ['名称', '类型', '主机', 'IP', '标签', '状态', '健康分', '延迟(ms)', '最后检查']
    const rows = filtered.map((a) => [
      a.name,
      TYPE_LABEL[a.type] || a.type,
      a.host,
      a.ip ?? '',
      (a.tags || []).join('|'),
      a.reachable === false ? '离线' : a.reachable ? '在线' : '未知',
      a.healthScore != null ? String(a.healthScore) : '',
      a.latencyMs != null ? String(a.latencyMs) : '',
      a.lastCheckAt ? new Date(a.lastCheckAt).toLocaleString('zh-CN', { hour12: false }) : '',
    ])
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `资产台账-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const cols: Column<Asset>[] = [
    {
      key: 'select',
      label: '选择',
      width: 48,
      render: (r) => (
        <Checkbox
          size="small"
          checked={selected.has(r.id)}
          onChange={() => toggleSelect(r.id)}
          onClick={(e) => e.stopPropagation()}
        />
      ),
    },
    { key: 'name', label: '名称' },
    { key: 'type', label: '类型', render: (r) => TYPE_LABEL[r.type] },
    { key: 'host', label: '主机' },
    { key: 'ip', label: 'IP', render: (r) => r.ip ?? '—' },
    {
      key: 'tags',
      label: '标签',
      render: (r) => (
        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ maxWidth: 220 }}>
          {(r.tags || []).slice(0, 3).map((t) => (
            <Chip key={t} size="small" label={t} variant="outlined" sx={{ height: 20, fontSize: 11 }} />
          ))}
        </Stack>
      ),
    },
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
      render: (r) => (r.reachable === false || r.healthScore == null ? '—' : r.healthScore),
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
          <Tooltip title="编辑">
            <IconButton size="small" onClick={() => openEdit(r)}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
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

      {/* 资产数据看板 */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={6} md={3}>
          <KpiCard title="资产总量" value={total} icon={<Add />} />
        </Grid>
        <Grid item xs={6} md={3}>
          <KpiCard title="在线" value={online} icon={<IconSelect />} color={theme.palette.success.main} />
        </Grid>
        <Grid item xs={6} md={3}>
          <KpiCard title="离线" value={offline} icon={<IconSelect />} color={offline ? theme.palette.error.main : theme.palette.text.secondary} />
        </Grid>
        <Grid item xs={6} md={3}>
          <KpiCard title="异常" value={abnormal} icon={<IconSelect />} color={abnormal ? theme.palette.warning.main : theme.palette.text.secondary} />
        </Grid>
      </Grid>

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
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>标签</InputLabel>
          <MuiSelect label="标签" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
            <MenuItem value="">全部</MenuItem>
            {allTags.map((t) => (
              <MenuItem key={t} value={t}>
                {t}
              </MenuItem>
            ))}
          </MuiSelect>
        </FormControl>
        <Button variant="outlined" onClick={load} disabled={loading}>
          筛选
        </Button>
        <Box sx={{ flexGrow: 1 }} />
        <Button variant="outlined" startIcon={<IconExport />} onClick={exportCsv} disabled={filtered.length === 0}>
          导出 CSV
        </Button>
      </Stack>

      {/* 批量操作工具栏 */}
      {selected.size > 0 && (
        <Stack direction="row" spacing={1.5} alignItems="center" mb={2} sx={{ p: 1.5, borderRadius: 2, border: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
          <Checkbox size="small" checked={filtered.length > 0 && selected.size === filtered.length} onChange={toggleAll} />
          <Typography variant="body2">
            已选 <b>{selected.size}</b> 项
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Button size="small" variant="outlined" startIcon={<IconTag />} onClick={() => setTagOpen(true)}>
            批量打标签
          </Button>
          <Button size="small" variant="outlined" color="error" startIcon={<DeleteOutline />} onClick={() => void bulkDelete()}>
            批量删除
          </Button>
          <Button size="small" color="inherit" onClick={() => setSelected(new Set())}>
            清空
          </Button>
        </Stack>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress />
        </Box>
      ) : (
        <DataTable columns={cols} rows={filtered} emptyText="未找到匹配资产，点击「添加主机」录入" />
      )}

      <Dialog
        open={dialogOpen}
        onClose={requestClose}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{editingId ? '编辑资产' : '添加主机'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              size="small"
              label="名称"
              placeholder="如 web-02"
              value={form.name}
              error={Boolean(formErrors.name)}
              helperText={formErrors.name}
              onChange={(e) => { setForm({ ...form, name: e.target.value }); setFormErrors((prev) => ({ ...prev, name: undefined })) }}
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
              error={Boolean(formErrors.host)}
              helperText={formErrors.host}
              onChange={(e) => { setForm({ ...form, host: e.target.value }); setFormErrors((prev) => ({ ...prev, host: undefined })); setConnectionTest({ state: 'idle' }) }}
            />
            <TextField
              size="small"
              label="IP（可选）"
              placeholder="展示用，可留空"
              value={form.ip}
              error={Boolean(formErrors.ip)}
              helperText={formErrors.ip}
              onChange={(e) => { setForm({ ...form, ip: e.target.value }); setFormErrors((prev) => ({ ...prev, ip: undefined })); setConnectionTest({ state: 'idle' }) }}
            />
            <TextField
              size="small"
              label="端口（可选）"
              placeholder="填了则 TCP 探测该端口，留空则 ping"
              value={form.port}
              error={Boolean(formErrors.port)}
              helperText={formErrors.port}
              onChange={(e) => { setForm({ ...form, port: e.target.value }); setFormErrors((prev) => ({ ...prev, port: undefined })); setConnectionTest({ state: 'idle' }) }}
            />
            <TextField
              size="small"
              label="标签（可选，逗号分隔）"
              placeholder="web,nginx"
              value={form.tags}
              error={Boolean(formErrors.tags)}
              helperText={formErrors.tags}
              onChange={(e) => { setForm({ ...form, tags: e.target.value }); setFormErrors((prev) => ({ ...prev, tags: undefined })) }}
            />
            <TextField
              select
              size="small"
              label="SSH 凭据（可选，采集指标/终端/服务检查用）"
              value={credentialId}
              onChange={(e) => { setCredentialId(e.target.value); setConnectionTest({ state: 'idle' }) }}
            >
              <MenuItem value="">
                <em>不关联</em>
              </MenuItem>
              {credentials.filter((c) => c.kind === 'ssh').map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}（{c.username || '-'}）
                </MenuItem>
              ))}
            </TextField>
            {credentialLoadError && <MuiAlert severity="warning" action={<Button size="small" onClick={() => api.credentials.list().then((list) => { setCredentials(list); setCredentialLoadError('') }).catch(() => setCredentialLoadError('凭据列表加载失败，可稍后重试'))}>重试</Button>}>{credentialLoadError}</MuiAlert>}
            {formSubmitError && <MuiAlert severity="error">{formSubmitError}</MuiAlert>}
            {connectionTest.state !== 'idle' && connectionTest.state !== 'testing' && <MuiAlert severity={connectionTest.state === 'success' ? 'success' : 'error'}>{connectionTest.message}</MuiAlert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={requestClose} disabled={submitting}>
            取消
          </Button>
          <Button variant="outlined" startIcon={connectionTest.state === 'testing' ? <CircularProgress size={16} /> : <NetworkCheck />} onClick={() => void testConnection()} disabled={submitting || connectionTest.state === 'testing'}>
            测试连接
          </Button>
          <Button variant="contained" onClick={submitAdd} disabled={submitting}>
            {submitting ? '保存中…' : editingId ? '保存' : '添加'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={discardConfirmOpen} onClose={() => setDiscardConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>放弃未保存的修改？</DialogTitle>
        <DialogContent>当前表单还有未保存内容，关闭后将丢失这些修改。</DialogContent>
        <DialogActions>
          <Button onClick={() => setDiscardConfirmOpen(false)}>继续编辑</Button>
          <Button color="error" variant="contained" onClick={discardAndClose}>放弃修改</Button>
        </DialogActions>
      </Dialog>

      {/* 批量打标签 */}
      <Dialog open={tagOpen} onClose={() => !bulkTagBusy && setTagOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>批量打标签（{selected.size} 项）</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <TextField
              size="small"
              label="标签（逗号分隔，覆盖式写入）"
              placeholder="web,生产,2026"
              value={bulkTags}
              onChange={(e) => setBulkTags(e.target.value)}
            />
            <Typography variant="caption" color="text.secondary">
              全部选中资产将被替换为以上标签组合，可用于统一分组 / 归档标记。
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTagOpen(false)} disabled={bulkTagBusy}>
            取消
          </Button>
          <Button variant="contained" onClick={() => void bulkTag()} disabled={bulkTagBusy}>
            {bulkTagBusy ? '处理中…' : '应用'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 删除确认 */}
      <Dialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          确定要删除资产「{deleteTarget?.name}」吗？此操作不可撤销，关联的告警与监控数据将一并移除。
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>取消</Button>
          <Button color="error" variant="contained" onClick={() => void confirmDelete()} disabled={deleting}>
            {deleting ? '删除中…' : '删除'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmBulkDelete} onClose={() => setConfirmBulkDelete(false)} maxWidth="xs" fullWidth>
        <DialogTitle>确认批量删除</DialogTitle>
        <DialogContent>
          确定要删除选中的 {selected.size} 个资产吗？此操作不可恢复。
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmBulkDelete(false)}>取消</Button>
          <Button color="error" variant="contained" onClick={() => void doBulkDelete()}>删除</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
