import { useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Stack,
  Alert,
  CircularProgress,
} from '@mui/material'
import { api } from '../../capabilities/bus'

// 修改密码弹窗：TopBar 用户菜单入口 + 首次登录（mustChangePassword）自动弹出。
interface Props {
  open: boolean
  onClose: () => void
  /** 首次登录强制改密模式：成功后不关闭，提示可关闭 */
  force?: boolean
  /** 密码修改成功后回调（父组件刷新本地用户信息，清除 mustChangePassword） */
  onChanged?: () => void
}

export default function ChangePasswordDialog({ open, onClose, force, onChanged }: Props) {
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)

  const reset = () => {
    setOldPassword('')
    setNewPassword('')
    setConfirm('')
    setError('')
    setOk(false)
  }

  const handleClose = () => {
    if (loading) return
    // 强制改密模式（首次登录）：后端已 403 锁死其它接口，这里同样不允许取消绕过
    if (force && !ok) return
    reset()
    onClose()
  }

  const submit = async () => {
    setError('')
    if (newPassword.length < 8) {
      setError('新密码至少 8 位')
      return
    }
    if (newPassword !== confirm) {
      setError('两次输入的新密码不一致')
      return
    }
    setLoading(true)
    try {
      await api.auth.changePassword(oldPassword, newPassword)
      setOk(true)
      setNewPassword('')
      setConfirm('')
      setOldPassword('')
      onChanged?.()
    } catch (e) {
      setError((e as Error).message || '修改失败')
    } finally {
      setLoading(false)
    }
  }

  return (
      <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth disableEscapeKeyDown={force && !ok}>
        <DialogTitle>{force ? '首次登录请修改默认密码' : '修改密码'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {force && !ok && (
              <Alert severity="warning">检测到仍在使用默认密码。出于安全考虑，修改密码前其它功能不可用（服务端已强制拦截）。</Alert>
            )}
          {error && <Alert severity="error">{error}</Alert>}
          {ok && <Alert severity="success">密码修改成功{force ? '，可关闭本窗口' : ''}。</Alert>}
          <TextField
            label="当前密码"
            type="password"
            fullWidth
            value={oldPassword}
            disabled={ok}
            onChange={(e) => setOldPassword(e.target.value)}
          />
          <TextField
            label="新密码（至少 8 位）"
            type="password"
            fullWidth
            value={newPassword}
            disabled={ok}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <TextField
            label="确认新密码"
            type="password"
            fullWidth
            value={confirm}
            disabled={ok}
            onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !loading && !ok && void submit()}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        {/* 强制模式未完成改密前不提供"取消"逃生口 */}
        {(ok || !force) && <Button onClick={handleClose}>{ok ? '关闭' : '取消'}</Button>}
        {!ok && (
          <Button variant="contained" onClick={() => void submit()} disabled={loading || !oldPassword || !newPassword || !confirm}>
            {loading ? <CircularProgress size={16} /> : '保存'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}