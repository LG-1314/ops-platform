import { useEffect, useState } from 'react'
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
  Grid,
  FormControlLabel,
  Switch,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import {
  Add as IconAdd,
  Delete as IconDelete,
  Cloud as IconCloud,
  Refresh as IconRefresh,
  FolderOpen as IconResources,
  Edit as IconEdit,
  Paid as IconPaid,
  Warning as IconWarning,
  NewReleases as IconNew,
  History as IconHistory,
} from '@mui/icons-material'
import { api } from '../../capabilities/bus'
import PageHeader from '../components/PageHeader'
import type {
  CloudAccount,
  CloudChangeLog,
  CloudProvider,
  CloudResource,
} from '@shared/types'

function providerLabel(p: CloudProvider): string {
  return p === 'tencent' ? '腾讯云' : '阿里云'
}

/** 到期天数（无到期信息返回 null） */
function daysToExpire(iso?: string): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.ceil((t - Date.now()) / 86400000)
}

const CHANGE_LABEL: Record<CloudChangeLog['changeType'], string> = {
  add: '新增',
  remove: '下线',
  change: '变化',
}

export default function Cloud() {
  const theme = useTheme()
  const [accounts, setAccounts] = useState<CloudAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [resources, setResources] = useState<CloudResource[] | null>(null)
  const [resourcesOpen, setResourcesOpen] = useState(false)
  const [resourcesLoading, setResourcesLoading] = useState(false)
  const [resourcesAccount, setResourcesAccount] = useState<CloudAccount | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [changes, setChanges] = useState<CloudChangeLog[]>([])
  const [onlyExpiring, setOnlyExpiring] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmDeleteName, setConfirmDeleteName] = useState('')

  const [form, setForm] = useState<{
    name: string
    provider: CloudProvider
    region: string
    accessKey: string
    secretKey: string
  }>({ name: '', provider: 'tencent', region: 'ap-guangzhou', accessKey: '', secretKey: '' })

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const a = await api.cloud.list()
      setAccounts(a)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function onResources(acc: CloudAccount) {
    setError(null)
    setResourcesAccount(acc)
    // 先清空上一账号的资源，避免新账号加载完成前展示旧账号的实例/到期统计
    setResources(null)
    await fetchResources(acc)
  }

  async function fetchResources(acc: CloudAccount) {
    setResourcesLoading(true)
    setError(null)
    try {
      const r = await api.cloud.resources(acc.id)
      setResources(r)
      setResourcesOpen(true)
      api.cloud.allChanges().then(setChanges).catch(() => {})
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setResourcesLoading(false)
    }
  }

  const openAdd = () => {
    setEditingId(null)
    setForm({ name: '', provider: 'tencent', region: 'ap-guangzhou', accessKey: '', secretKey: '' })
    setOpen(true)
  }

  const openEdit = (a: CloudAccount) => {
    setEditingId(a.id)
    setForm({ name: a.name, provider: a.provider, region: a.region || '', accessKey: '', secretKey: '' })
    setOpen(true)
  }

  function askDelete(id: string, name: string) {
    setConfirmDeleteId(id)
    setConfirmDeleteName(name)
  }

  async function doDelete() {
    if (!confirmDeleteId) return
    try {
      await api.cloud.remove(confirmDeleteId)
      setConfirmDeleteId(null)
      await load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function onProviderChange(p: CloudProvider) {
    setForm((f) => ({
      ...f,
      provider: p,
      region: p === 'tencent' ? 'ap-guangzhou' : 'cn-hangzhou',
    }))
  }

  // 资源弹窗派生统计：即将到期(≤30天)、本月新增、筛选视图
  const expiringList = (resources || []).filter((r) => {
    const d = daysToExpire(r.expireAt)
    return d !== null && d <= 30
  })
  const expiringCount = expiringList.length
  const shownResources = onlyExpiring ? expiringList : resources || []
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const accountChanges = changes.filter((c) => c.accountId === resourcesAccount?.id)
  const addedThisMonth = accountChanges.filter(
    (c) => c.changeType === 'add' && new Date(c.at).getTime() >= monthStart.getTime(),
  ).length

  async function onSubmit() {
    setSubmitting(true)
    setError(null)
    let credentialId: string | undefined
    try {
      if (form.accessKey && form.secretKey) {
        const cred = await api.credentials.create({
          name: `${form.name} 云凭据`,
          kind: 'cloud',
          provider: form.provider,
          region: form.region,
          accessKey: form.accessKey,
          secretKey: form.secretKey,
        })
        credentialId = cred.id
      }
      const payload = {
        name: form.name,
        provider: form.provider,
        region: form.region || undefined,
        credentialId: credentialId || undefined,
      }
      if (editingId) await api.cloud.update(editingId, payload)
      else await api.cloud.create(payload)
      setOpen(false)
      setForm({ name: '', provider: 'tencent', region: 'ap-guangzhou', accessKey: '', secretKey: '' })
      await load()
    } catch (e) {
      // 两段式创建（先凭据后账号）：账号失败时回收刚建的凭据，避免孤儿凭据
      if (credentialId && !editingId) {
        await api.credentials.remove(credentialId).catch(() => {})
      }
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Box>
      {/* 与其他 21 页统一使用 PageHeader（此前为本页手写标题，样式不一致） */}
      <PageHeader
        title="云资源管理"
        subtitle="纳管腾讯云 / 阿里云账号，实时拉取 CVM / ECS 实例资产"
        actions={
          <Stack direction="row" spacing={1}>
            <Button startIcon={<IconRefresh />} onClick={() => void load()} color="inherit">
              刷新
            </Button>
            <Button variant="contained" startIcon={<IconAdd />} onClick={openAdd}>
              添加账号
            </Button>
          </Stack>
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
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>名称</TableCell>
                <TableCell>厂商</TableCell>
                <TableCell>区域</TableCell>
                <TableCell>凭据</TableCell>
                <TableCell align="right">操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {accounts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} sx={{ color: theme.palette.text.secondary }}>
                    暂无云账号，点击「添加账号」开始纳管。
                  </TableCell>
                </TableRow>
              )}
              {accounts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell sx={{ fontWeight: 600 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <IconCloud fontSize="small" sx={{ color: theme.palette.primary.main }} />
                      {a.name}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={providerLabel(a.provider)} />
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'var(--font-mono)' }}>{a.region || '-'}</TableCell>
                  <TableCell>{a.credentialId ? '已配置' : '未配置'}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="查看资源">
                      <IconButton size="small" onClick={() => void onResources(a)}>
                        <IconResources fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="编辑">
                      <IconButton size="small" onClick={() => openEdit(a)}>
                        <IconEdit fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="删除">
                      <IconButton size="small" onClick={() => askDelete(a.id, a.name)}>
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

      {/* 添加 / 编辑账号 */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{editingId ? '编辑云账号' : '添加云账号'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {error && (
              <Alert severity="error">{error}</Alert>
            )}
            <TextField
              label="名称"
              fullWidth
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <TextField
              label="厂商"
              select
              fullWidth
              value={form.provider}
              onChange={(e) => onProviderChange(e.target.value as CloudProvider)}
            >
              <MenuItem value="tencent">腾讯云</MenuItem>
              <MenuItem value="aliyun">阿里云</MenuItem>
            </TextField>
            <TextField
              label="区域"
              fullWidth
              value={form.region}
              onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
              placeholder={form.provider === 'tencent' ? 'ap-guangzhou' : 'cn-hangzhou'}
            />
            <TextField
              label={editingId ? 'AccessKey / SecretId（留空保持不变）' : 'AccessKey / SecretId'}
              fullWidth
              value={form.accessKey}
              onChange={(e) => setForm((f) => ({ ...f, accessKey: e.target.value }))}
            />
            <TextField
              label={editingId ? 'SecretKey（留空保持不变）' : 'SecretKey'}
              type="password"
              fullWidth
              value={form.secretKey}
              onChange={(e) => setForm((f) => ({ ...f, secretKey: e.target.value }))}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={submitting}>取消</Button>
          {/* 编辑态允许只改名称/区域（密钥留空保持原凭据）；新建态必须完整填写 */}
          <Button
            variant="contained"
            disabled={submitting || !form.name || (!editingId && (!form.accessKey || !form.secretKey))}
            onClick={() => void onSubmit()}
          >
            {submitting ? '保存中…' : '保存'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 删除确认 */}
      <Dialog open={!!confirmDeleteId} onClose={() => setConfirmDeleteId(null)} maxWidth="xs" fullWidth>
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          确定要删除云账号「{confirmDeleteName}」吗？此操作不可恢复。
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteId(null)}>取消</Button>
          <Button color="error" variant="contained" onClick={() => void doDelete()}>删除</Button>
        </DialogActions>
      </Dialog>

      {/* 资源列表 */}
      <Dialog open={resourcesOpen} onClose={() => setResourcesOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          云资源 · {resourcesAccount?.name || ''}
          <Box sx={{ flexGrow: 1 }} />
          {resourcesAccount && (
            <Tooltip title="同步云端资源">
              <IconButton size="small" disabled={resourcesLoading} onClick={() => void fetchResources(resourcesAccount)}>
                {resourcesLoading ? <CircularProgress size={18} /> : <IconRefresh fontSize="small" />}
              </IconButton>
            </Tooltip>
          )}
        </DialogTitle>
        <DialogContent>
          {resources === null ? (
            <Box display="flex" justifyContent="center" py={4}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <Box>
              {/* 账单概览看板 */}
              <Grid container spacing={1.5} sx={{ mb: 2 }}>
                <Grid item xs={6} md={3}>
                  <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <IconCloud fontSize="small" color="primary" />
                      <Box>
                        <Typography variant="caption" color="text.secondary">实例总数</Typography>
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>{resources.length}</Typography>
                      </Box>
                    </Stack>
                  </Paper>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <IconPaid fontSize="small" color="success" />
                      <Box>
                        <Typography variant="caption" color="text.secondary">月度估算费用</Typography>
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>
                          ¥{resources.reduce((s, r) => s + (r.monthlyCost || 0), 0)}
                        </Typography>
                      </Box>
                    </Stack>
                  </Paper>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <IconWarning fontSize="small" color={expiringCount > 0 ? 'warning' : 'disabled'} />
                      <Box>
                        <Typography variant="caption" color="text.secondary">30 天内到期</Typography>
                        <Typography variant="h6" sx={{ fontWeight: 700, color: expiringCount > 0 ? theme.palette.warning.main : undefined }}>
                          {expiringCount}
                        </Typography>
                      </Box>
                    </Stack>
                  </Paper>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <IconNew fontSize="small" color="info" />
                      <Box>
                        <Typography variant="caption" color="text.secondary">本月新增</Typography>
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>{addedThisMonth}</Typography>
                      </Box>
                    </Stack>
                  </Paper>
                </Grid>
              </Grid>

              <Stack direction="row" justifyContent="flex-end" sx={{ mb: 1 }}>
                <FormControlLabel
                  control={<Switch size="small" checked={onlyExpiring} onChange={(e) => setOnlyExpiring(e.target.checked)} />}
                  label={<Typography variant="body2">仅看即将到期</Typography>}
                />
              </Stack>

              <Paper sx={{ p: 0, overflow: 'hidden', mt: 1 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>名称</TableCell>
                      <TableCell>类型</TableCell>
                      <TableCell>区域</TableCell>
                      <TableCell>状态</TableCell>
                      <TableCell>规格</TableCell>
                      <TableCell>月费估算</TableCell>
                      <TableCell>到期</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {shownResources.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} sx={{ color: theme.palette.text.secondary }}>
                          {onlyExpiring ? '没有 30 天内到期的实例。' : '该账号下暂无实例（或凭据/权限不足）。'}
                        </TableCell>
                      </TableRow>
                    )}
                    {shownResources.map((r) => {
                      const d = daysToExpire(r.expireAt)
                      return (
                        <TableRow key={r.id} hover>
                          <TableCell sx={{ fontWeight: 600 }}>{r.name}</TableCell>
                          <TableCell>
                            <Chip size="small" label={r.type} />
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'var(--font-mono)' }}>{r.region}</TableCell>
                          <TableCell>{r.status}</TableCell>
                          <TableCell sx={{ fontFamily: 'var(--font-mono)' }}>
                            {r.extra?.CPU ? `${r.extra.CPU}核/${r.extra.Memory}GB` : '-'}
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'var(--font-mono)' }}>
                            {r.monthlyCost ? `¥${r.monthlyCost}` : '-'}
                          </TableCell>
                          <TableCell>
                            {d === null ? (
                              <Typography variant="body2" color="text.secondary">按量付费</Typography>
                            ) : (
                              <Chip
                                size="small"
                                color={d <= 7 ? 'error' : d <= 30 ? 'warning' : 'default'}
                                variant={d <= 30 ? 'filled' : 'outlined'}
                                label={d < 0 ? '已到期' : `${d} 天`}
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </Paper>

              {/* 变更日志 */}
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2, mb: 1 }}>
                <IconHistory fontSize="small" />
                <Typography variant="subtitle2">资源变更日志</Typography>
              </Stack>
              <Paper variant="outlined" sx={{ p: 0, overflow: 'hidden', borderRadius: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>时间</TableCell>
                      <TableCell>资源</TableCell>
                      <TableCell>变更</TableCell>
                      <TableCell>详情</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {accountChanges.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} sx={{ color: theme.palette.text.secondary }}>
                          暂无变更记录（首次同步后，实例增删/规格变化会记录在此）。
                        </TableCell>
                      </TableRow>
                    )}
                    {accountChanges.slice(0, 20).map((c) => (
                      <TableRow key={c.id} hover>
                        <TableCell sx={{ fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                          {new Date(c.at).toLocaleString('zh-CN', { hour12: false })}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{c.resourceName}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            color={c.changeType === 'add' ? 'success' : c.changeType === 'remove' ? 'error' : 'info'}
                            variant="outlined"
                            label={CHANGE_LABEL[c.changeType]}
                          />
                        </TableCell>
                        <TableCell>{c.detail}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Paper>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResourcesOpen(false)}>关闭</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
