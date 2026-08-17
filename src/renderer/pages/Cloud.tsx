import { useEffect, useMemo, useState } from 'react'
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
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import {
  Add as IconAdd,
  Delete as IconDelete,
  Cloud as IconCloud,
  Refresh as IconRefresh,
  FolderOpen as IconResources,
} from '@mui/icons-material'
import { api } from '../../capabilities/bus'
import type {
  CloudAccount,
  CloudProvider,
  CloudResource,
  Credential,
} from '@shared/types'

function providerLabel(p: CloudProvider): string {
  return p === 'tencent' ? '腾讯云' : '阿里云'
}

export default function Cloud() {
  const theme = useTheme()
  const [accounts, setAccounts] = useState<CloudAccount[]>([])
  const [creds, setCreds] = useState<Credential[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [resources, setResources] = useState<CloudResource[] | null>(null)
  const [resourcesOpen, setResourcesOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState<{
    name: string
    provider: CloudProvider
    region: string
    accessKey: string
    secretKey: string
  }>({ name: '', provider: 'tencent', region: 'ap-guangzhou', accessKey: '', secretKey: '' })

  const cloudCreds = useMemo(() => creds.filter((c) => c.kind === 'cloud'), [creds])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [a, cr] = await Promise.all([api.cloud.list(), api.credentials.list()])
      setAccounts(a)
      setCreds(cr)
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
    try {
      const r = await api.cloud.resources(acc.id)
      setResources(r)
      setResourcesOpen(true)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function onDelete(id: string) {
    try {
      await api.cloud.remove(id)
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

  async function onSubmit() {
    setSubmitting(true)
    setError(null)
    try {
      let credentialId: string | undefined
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
      await api.cloud.create({
        name: form.name,
        provider: form.provider,
        region: form.region || undefined,
        credentialId,
      })
      setOpen(false)
      setForm({ name: '', provider: 'tencent', region: 'ap-guangzhou', accessKey: '', secretKey: '' })
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            云资源管理
          </Typography>
          <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
            纳管腾讯云 / 阿里云账号，实时拉取 CVM / ECS 实例资产
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button startIcon={<IconRefresh />} onClick={() => void load()} color="inherit">
            刷新
          </Button>
          <Button variant="contained" startIcon={<IconAdd />} onClick={() => setOpen(true)}>
            添加账号
          </Button>
        </Stack>
      </Stack>

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
                  <TableCell sx={{ fontFamily: 'monospace' }}>{a.region || '-'}</TableCell>
                  <TableCell>{a.credentialId ? '已配置' : '未配置'}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="查看资源">
                      <IconButton size="small" onClick={() => void onResources(a)}>
                        <IconResources fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="删除">
                      <IconButton size="small" onClick={() => void onDelete(a.id)}>
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

      {/* 添加账号 */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>添加云账号</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
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
              label="AccessKey / SecretId"
              fullWidth
              value={form.accessKey}
              onChange={(e) => setForm((f) => ({ ...f, accessKey: e.target.value }))}
            />
            <TextField
              label="SecretKey"
              type="password"
              fullWidth
              value={form.secretKey}
              onChange={(e) => setForm((f) => ({ ...f, secretKey: e.target.value }))}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>取消</Button>
          <Button
            variant="contained"
            disabled={submitting || !form.name || !form.accessKey || !form.secretKey}
            onClick={() => void onSubmit()}
          >
            保存
          </Button>
        </DialogActions>
      </Dialog>

      {/* 资源列表 */}
      <Dialog open={resourcesOpen} onClose={() => setResourcesOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>云资源</DialogTitle>
        <DialogContent>
          {resources === null ? (
            <Box display="flex" justifyContent="center" py={4}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <Paper sx={{ p: 0, overflow: 'hidden', mt: 1 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>名称</TableCell>
                    <TableCell>类型</TableCell>
                    <TableCell>区域</TableCell>
                    <TableCell>状态</TableCell>
                    <TableCell>规格</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {resources.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} sx={{ color: theme.palette.text.secondary }}>
                        该账号下暂无实例（或凭据/权限不足）。
                      </TableCell>
                    </TableRow>
                  )}
                  {resources.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell sx={{ fontWeight: 600 }}>{r.name}</TableCell>
                      <TableCell>
                        <Chip size="small" label={r.type} />
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{r.region}</TableCell>
                      <TableCell>{r.status}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace' }}>
                        {r.extra?.CPU ? `${r.extra.CPU}核/${r.extra.Memory}GB` : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResourcesOpen(false)}>关闭</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
