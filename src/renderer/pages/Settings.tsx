import { useEffect, useState } from 'react'
import {
  Box,
  Typography,
  Stack,
  Card,
  CardContent,
  Paper,
  Divider,
  CircularProgress,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  useTheme,
  Switch,
  TextField,
  MenuItem,
  Button,
  IconButton,
  Alert as MuiAlert,
  FormControlLabel,
} from '@mui/material'
import {
  Hub,
  CheckCircle,
  Warning,
  Error as ErrorIcon,
  Palette,
  Description,
  Security,
  Notifications as IconNotify,
  Edit as IconEdit,
  Delete as IconDelete,
  Add as IconAdd,
  Send as IconSend,
} from '@mui/icons-material'
import { api } from '../../capabilities/bus'
import { useThemeMode } from '../state/ThemeModeProvider'
import type { NotificationChannel, NotificationChannelType } from '@shared/types'
import PageHeader from '../components/PageHeader'

const TYPE_LABEL: Record<NotificationChannelType, string> = {
  webhook: 'Webhook',
  feishu: '飞书',
  dingtalk: '钉钉',
  inapp: '应用内',
  email: '邮件',
}

interface ChannelForm {
  id?: string
  name: string
  type: NotificationChannelType
  url: string
  secret: string
  enabled: boolean
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUser: string
  smtpPassword: string
  smtpFrom: string
  smtpTo: string
}

const emptyForm = (): ChannelForm => ({
  name: '',
  type: 'webhook',
  url: '',
  secret: '',
  enabled: true,
  smtpHost: '',
  smtpPort: 465,
  smtpSecure: true,
  smtpUser: '',
  smtpPassword: '',
  smtpFrom: '',
  smtpTo: '',
})

export default function Settings() {
  const theme = useTheme()
  const { mode, toggle } = useThemeMode()
  const [health, setHealth] = useState<boolean | null>(null)
  const [channels, setChannels] = useState<NotificationChannel[]>([])
  const [form, setForm] = useState<ChannelForm>(emptyForm())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testMsg, setTestMsg] = useState<{ id: string; ok: boolean; message: string } | null>(null)

  useEffect(() => {
    api.health()
      .then((r) => setHealth(r.ok))
      .catch(() => setHealth(false))
    api.notificationChannels
      .list()
      .then(setChannels)
      .catch(() => {})
  }, [])

  const resetForm = () => {
    setForm(emptyForm())
    setEditingId(null)
    setErr('')
  }

  const onEdit = (c: NotificationChannel) => {
    setEditingId(c.id)
    setForm({
      id: c.id,
      name: c.name,
      type: c.type,
      url: c.url || '',
      secret: '', // 留空=保留原密钥
      enabled: c.enabled,
      smtpHost: c.smtpHost || '',
      smtpPort: c.smtpPort || (c.smtpSecure === false ? 587 : 465),
      smtpSecure: c.smtpSecure ?? true,
      smtpUser: c.smtpUser || '',
      smtpPassword: '', // 留空=保留原密码
      smtpFrom: c.smtpFrom || '',
      smtpTo: c.smtpTo || '',
    })
    setErr('')
  }

  const validate = (): string => {
    if (!form.name.trim()) return '请填写渠道名称'
    if (form.type === 'email') {
      if (!form.smtpHost.trim()) return '请填写 SMTP 主机'
      if (!form.smtpUser.trim()) return '请填写 SMTP 用户名'
      if (!Number.isInteger(form.smtpPort) || form.smtpPort <= 0 || form.smtpPort > 65535) return 'SMTP 端口须为 1-65535 的整数'
      if (!form.smtpTo.trim()) return '请填写收件人邮箱'
      if (!form.smtpTo.split(',').every((s) => s.trim().includes('@'))) return '收件人邮箱格式不正确'
      if (!editingId && !form.smtpPassword) return '新增邮件渠道须填写 SMTP 密码'
      return ''
    }
    if (form.type !== 'inapp' && !form.url.trim()) return 'Webhook / 飞书 / 钉钉 需填写机器人地址'
    return ''
  }

  const onSave = async () => {
    setErr('')
    const v = validate()
    if (v) {
      setErr(v)
      return
    }
    const payload: Partial<NotificationChannel> = { name: form.name.trim(), type: form.type, enabled: form.enabled }
    if (form.type === 'email') {
      payload.smtpHost = form.smtpHost.trim()
      payload.smtpPort = form.smtpPort
      payload.smtpSecure = form.smtpSecure
      payload.smtpUser = form.smtpUser.trim()
      payload.smtpFrom = form.smtpFrom.trim()
      payload.smtpTo = form.smtpTo.trim()
      if (form.smtpPassword) payload.smtpPassword = form.smtpPassword // 留空则保留原密码
    } else if (form.type !== 'inapp') {
      payload.url = form.url.trim()
      if (form.secret) payload.secret = form.secret // 留空则保留原密钥
    }
    try {
      if (editingId) await api.notificationChannels.update(editingId, payload)
      else await api.notificationChannels.create(payload)
      resetForm()
      setChannels(await api.notificationChannels.list())
    } catch (e) {
      setErr((e as Error).message || '保存失败')
    }
  }

  const onDelete = async (id: string) => {
    await api.notificationChannels.remove(id).catch(() => {})
    setChannels(await api.notificationChannels.list())
  }

  const toggleEnabled = async (c: NotificationChannel, val: boolean) => {
    await api.notificationChannels.update(c.id, { enabled: val }).catch(() => {})
    setChannels(await api.notificationChannels.list())
  }

  const onTest = async (c: NotificationChannel) => {
    setTestingId(c.id)
    setTestMsg(null)
    try {
      const r = await api.notificationChannels.test(c.id)
      setTestMsg({ id: c.id, ok: r.ok, message: r.message })
    } catch (e) {
      setTestMsg({ id: c.id, ok: false, message: (e as Error).message || '测试失败' })
    } finally {
      setTestingId(null)
    }
  }

  const isEmail = form.type === 'email'
  const isInapp = form.type === 'inapp'

  return (
    <Box>
      <PageHeader title="设置" subtitle="能力总线连接、主题视觉规范、告警通知渠道" />

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>
            能力总线（Express 8787）
          </Typography>
          <Divider sx={{ mb: 1.5 }} />
          <Stack direction="row" spacing={1} alignItems="center">
            {health === null ? (
              <CircularProgress size={18} />
            ) : health ? (
              <Chip icon={<CheckCircle />} label="已连接 · 所有运维能力在线" color="success" variant="outlined" />
            ) : (
              <Chip label="连接失败" color="error" variant="outlined" />
            )}
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" mb={1}>
            <Palette sx={{ color: theme.palette.primary.main }} />
            <Typography variant="subtitle1">主题与视觉规范</Typography>
          </Stack>
          <Divider sx={{ mb: 1.5 }} />
          <FormControlLabel
            control={<Switch checked={mode === 'light'} onChange={toggle} />}
            label={mode === 'light' ? '当前：浅色模式' : '当前：深色模式'}
          />
          <Typography variant="caption" color="text.secondary">
            切换后立即生效并自动保存，重启应用后保持。
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
            <Chip label="主色 #3D7BFF" variant="outlined" />
            <Chip label="卡片圆角 8px" variant="outlined" />
            <Chip size="small" icon={<CheckCircle color="success" />} label="正常" variant="outlined" />
            <Chip size="small" icon={<Warning color="warning" />} label="警告" variant="outlined" />
            <Chip size="small" icon={<ErrorIcon color="error" />} label="严重" variant="outlined" />
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" mb={1}>
            <IconNotify sx={{ color: theme.palette.primary.main }} />
            <Typography variant="subtitle1">通知渠道</Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            告警触发后实时推送至邮件 / 飞书 / 钉钉 / 通用 Webhook（对标 NexusOps 通知能力）。启用中的渠道会在每次生成告警时自动推送。
          </Typography>
          <Divider sx={{ my: 1.5 }} />

          {channels.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              暂无通知渠道，请在下方添加。
            </Typography>
          )}

          <Stack spacing={1} mb={2}>
            {channels.map((c) => (
              <Paper key={c.id} sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={600}>
                    {c.name}{' '}
                    <Chip size="small" label={TYPE_LABEL[c.type]} sx={{ ml: 0.5 }} />
                  </Typography>
                  {c.type === 'email' ? (
                    <Typography variant="caption" color="text.secondary" noWrap display="block" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.smtpHost} · {c.smtpUser} → {c.smtpTo}
                    </Typography>
                  ) : c.url ? (
                    <Typography variant="caption" color="text.secondary" noWrap display="block" sx={{ maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.url}
                    </Typography>
                  ) : null}
                  {testMsg?.id === c.id && (
                    <Typography variant="caption" sx={{ color: testMsg.ok ? 'success.main' : 'error.main' }}>
                      {testMsg.message}
                    </Typography>
                  )}
                </Box>
                <Switch
                  size="small"
                  checked={c.enabled}
                  onChange={(e) => toggleEnabled(c, e.target.checked)}
                />
                <IconButton size="small" title="测试发送" onClick={() => onTest(c)} disabled={testingId === c.id}>
                  {testingId === c.id ? <CircularProgress size={16} /> : <IconSend fontSize="small" />}
                </IconButton>
                <IconButton size="small" onClick={() => onEdit(c)}>
                  <IconEdit fontSize="small" />
                </IconButton>
                <IconButton size="small" color="error" onClick={() => onDelete(c.id)}>
                  <IconDelete fontSize="small" />
                </IconButton>
              </Paper>
            ))}
          </Stack>

          {err && (
            <MuiAlert severity="error" sx={{ mb: 2 }}>
              {err}
            </MuiAlert>
          )}

          <Stack spacing={1.5}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems="flex-end">
              <TextField
                label="名称"
                size="small"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                sx={{ flex: 1 }}
              />
              <TextField
                label="类型"
                select
                size="small"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as NotificationChannelType })}
                sx={{ width: 140 }}
              >
                <MenuItem value="email">邮件</MenuItem>
                <MenuItem value="feishu">飞书</MenuItem>
                <MenuItem value="dingtalk">钉钉</MenuItem>
                <MenuItem value="webhook">Webhook</MenuItem>
                <MenuItem value="inapp">应用内</MenuItem>
              </TextField>
              {!isEmail && !isInapp && (
                <TextField
                  label="机器人地址 (URL)"
                  size="small"
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  sx={{ flex: 2 }}
                />
              )}
              {!isEmail && !isInapp && (
                <TextField
                  label="签名密钥 (可选)"
                  size="small"
                  type="password"
                  value={form.secret}
                  onChange={(e) => setForm({ ...form, secret: e.target.value })}
                  sx={{ flex: 1 }}
                />
              )}
            </Stack>

            {isEmail && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Stack spacing={1.5}>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                    <TextField
                      label="SMTP 主机"
                      size="small"
                      required
                      value={form.smtpHost}
                      onChange={(e) => setForm({ ...form, smtpHost: e.target.value })}
                      sx={{ flex: 2 }}
                      placeholder="smtp.example.com"
                    />
                    <TextField
                      label="端口"
                      size="small"
                      type="number"
                      value={form.smtpPort}
                      onChange={(e) => setForm({ ...form, smtpPort: Number(e.target.value) })}
                      sx={{ width: 110 }}
                    />
                    <FormControlLabel
                      control={
                        <Switch
                          size="small"
                          checked={form.smtpSecure}
                          onChange={(e) =>
                            setForm({ ...form, smtpSecure: e.target.checked, smtpPort: e.target.checked ? 465 : 587 })
                          }
                        />
                      }
                      label={form.smtpSecure ? 'SSL/TLS (465)' : 'STARTTLS (587)'}
                      sx={{ mx: 0 }}
                    />
                  </Stack>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                    <TextField
                      label="用户名"
                      size="small"
                      required
                      value={form.smtpUser}
                      onChange={(e) => setForm({ ...form, smtpUser: e.target.value })}
                      sx={{ flex: 1 }}
                    />
                    <TextField
                      label={editingId ? '密码（留空则保留原密码）' : '密码'}
                      size="small"
                      type="password"
                      required={!editingId}
                      value={form.smtpPassword}
                      onChange={(e) => setForm({ ...form, smtpPassword: e.target.value })}
                      sx={{ flex: 1 }}
                    />
                  </Stack>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                    <TextField
                      label="发件人（可选，默认=用户名）"
                      size="small"
                      value={form.smtpFrom}
                      onChange={(e) => setForm({ ...form, smtpFrom: e.target.value })}
                      sx={{ flex: 1 }}
                      placeholder="ops@example.com"
                    />
                    <TextField
                      label="收件人（逗号分隔）"
                      size="small"
                      required
                      value={form.smtpTo}
                      onChange={(e) => setForm({ ...form, smtpTo: e.target.value })}
                      sx={{ flex: 1 }}
                      placeholder="a@example.com,b@example.com"
                    />
                  </Stack>
                </Stack>
              </Paper>
            )}

            <Stack direction="row" spacing={1.5} alignItems="center">
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={form.enabled}
                    onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                  />
                }
                label="启用"
                sx={{ mx: 0 }}
              />
              <Button
                variant="contained"
                startIcon={editingId ? <IconEdit /> : <IconAdd />}
                onClick={onSave}
              >
                {editingId ? '保存' : '添加'}
              </Button>
              {editingId && (
                <Button variant="text" onClick={resetForm}>
                  取消
                </Button>
              )}
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>
            模块与能力
          </Typography>
          <Divider sx={{ mb: 1 }} />
          <List dense>
            <ListItem>
              <ListItemIcon><Hub /></ListItemIcon>
              <ListItemText primary="统一资产纳管 / 智能接入" secondary="运维搭子" />
            </ListItem>
            <ListItem>
              <ListItemIcon><Security /></ListItemIcon>
              <ListItemText primary="全栈诊断 / 等保基线" secondary="TencentOS 全栈诊断" />
            </ListItem>
            <ListItem>
              <ListItemIcon><Description /></ListItemIcon>
              <ListItemText primary="知识检索 / 关联视图" secondary="运维监控 FAQ 知识库" />
            </ListItem>
          </List>
        </CardContent>
      </Card>
    </Box>
  )
}
