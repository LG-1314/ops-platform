import { useEffect, useState } from 'react'
import {
  Box,
  Stack,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Chip,
  CircularProgress,
  Alert as MuiAlert,
  useTheme,
  Snackbar,
} from '@mui/material'
import {
  Add as IconAdd,
  Delete as IconDelete,
  Edit as IconEdit,
  Refresh as IconRefresh,
  Person as IconPerson,
  AdminPanelSettings as IconAdmin,
} from '@mui/icons-material'
import { api } from '../../capabilities/bus'
import type { SafeUser, UserRole } from '@shared/types'
import PageHeader from '../components/PageHeader'
import { useUser } from '../state/userRole'

interface FormState {
  id?: string
  username: string
  password: string
  displayName: string
  role: UserRole
}

const emptyForm: FormState = { username: '', password: '', displayName: '', role: 'personal' }

export default function Users() {
  const theme = useTheme()
  const me = useUser()
  const [users, setUsers] = useState<SafeUser[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editing, setEditing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [snack, setSnack] = useState('')

  const load = () => {
    setLoading(true)
    setError('')
    api.users
      .list()
      .then(setUsers)
      .catch((e) => setError((e as Error).message || '加载失败'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const openCreate = () => {
    setForm(emptyForm)
    setEditing(false)
    setError('')
    setOpen(true)
  }
  const openEdit = (u: SafeUser) => {
    setForm({ id: u.id, username: u.username, password: '', displayName: u.displayName, role: u.role })
    setEditing(true)
    setError('')
    setOpen(true)
  }

  const submit = async () => {
    setSubmitting(true)
    setError('')
    try {
      if (editing && form.id) {
        const patch: { displayName?: string; role?: UserRole; password?: string } = {
          displayName: form.displayName,
          role: form.role,
        }
        if (form.password) patch.password = form.password
        await api.users.update(form.id, patch)
        setSnack('用户已更新')
      } else {
        await api.users.create({
          username: form.username.trim(),
          password: form.password,
          displayName: form.displayName.trim() || form.username.trim(),
          role: form.role,
        })
        setSnack('用户已创建')
      }
      setOpen(false)
      load()
    } catch (e) {
      setError((e as Error).message || '保存失败')
    } finally {
      setSubmitting(false)
    }
  }

  const remove = async (u: SafeUser) => {
    if (me?.id === u.id) {
      setError('不能删除当前登录用户')
      return
    }
    try {
      await api.users.remove(u.id)
      setSnack('用户已删除')
      load()
    } catch (e) {
      setError((e as Error).message || '删除失败')
    }
  }

  return (
    <Box>
      <PageHeader
        title="用户管理"
        subtitle="RBAC 多用户：账号 / 角色 / 密码管理（仅管理员）"
        actions={
          <Stack direction="row" spacing={1}>
            <Button startIcon={<IconRefresh />} color="inherit" onClick={load} disabled={loading}>
              刷新
            </Button>
            <Button variant="contained" startIcon={<IconAdd />} onClick={openCreate}>
              新建用户
            </Button>
          </Stack>
        }
      />

      {error && <MuiAlert severity="error" sx={{ mb: 2 }}>{error}</MuiAlert>}

      <Paper sx={{ p: 0, overflow: 'hidden' }}>
        {loading ? (
          <Box display="flex" justifyContent="center" py={6}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>用户名</TableCell>
                <TableCell>显示名</TableCell>
                <TableCell>角色</TableCell>
                <TableCell>创建时间</TableCell>
                <TableCell>最近登录</TableCell>
                <TableCell align="right">操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} sx={{ color: theme.palette.text.secondary }}>
                    暂无用户。
                  </TableCell>
                </TableRow>
              )}
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell sx={{ fontWeight: 600 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {u.role === 'admin' ? (
                        <IconAdmin fontSize="small" sx={{ color: theme.palette.primary.main }} />
                      ) : (
                        <IconPerson fontSize="small" sx={{ color: theme.palette.text.secondary }} />
                      )}
                      {u.username}
                      {me?.id === u.id && (
                        <Chip size="small" label="当前" color="primary" variant="outlined" sx={{ height: 18, fontSize: 11 }} />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>{u.displayName}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={u.role === 'admin' ? '运维管理员' : '个人用户'}
                      color={u.role === 'admin' ? 'primary' : 'default'}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell sx={{ color: theme.palette.text.secondary }}>
                    {new Date(u.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell sx={{ color: theme.palette.text.secondary }}>
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '—'}
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => openEdit(u)} title="编辑">
                      <IconEdit fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => void remove(u)}
                      disabled={me?.id === u.id}
                      title={me?.id === u.id ? '不能删除当前用户' : '删除'}
                    >
                      <IconDelete fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{editing ? '编辑用户' : '新建用户'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="用户名"
              fullWidth
              disabled={editing}
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
            <TextField
              label="显示名"
              fullWidth
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            />
            <TextField
              label={editing ? '新密码（留空则不修改）' : '密码'}
              type="password"
              fullWidth
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              helperText={editing ? '' : '至少 6 位'}
            />
            <TextField
              label="角色"
              select
              fullWidth
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
            >
              <MenuItem value="admin">运维管理员（全部模块）</MenuItem>
              <MenuItem value="personal">个人用户（常用模块）</MenuItem>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>取消</Button>
          <Button
            variant="contained"
            disabled={submitting || !form.username || (!editing && form.password.length < 6)}
            onClick={() => void submit()}
          >
            {submitting ? '保存中…' : '保存'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(snack)} autoHideDuration={2500} onClose={() => setSnack('')} message={snack} />
    </Box>
  )
}
