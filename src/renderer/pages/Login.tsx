import { useState } from 'react'
import {
  Box,
  Typography,
  Stack,
  TextField,
  Button,
  Paper,
  Alert as MuiAlert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  useTheme,
} from '@mui/material'
import { Lock as IconLock, Login as IconLogin } from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import { api } from '../../capabilities/bus'
import { setSession } from '../state/userRole'
import Logo from '../components/Logo'
import type { SafeUser } from '@shared/types'

export default function Login() {
  const theme = useTheme()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 首次登录强制改密：播种的默认口令（admin/admin123）登录后必须改密才能进入
  const [pendingUser, setPendingUser] = useState<SafeUser | null>(null)
  const [pendingToken, setPendingToken] = useState('')
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [changeError, setChangeError] = useState('')
  const [changing, setChanging] = useState(false)

  const submit = async () => {
    if (!username || !password) {
      setError('请输入用户名和密码')
      return
    }
    setLoading(true)
    setError('')
    try {
      const r = await api.auth.login(username.trim(), password)
      if (r.user.mustChangePassword) {
        // 强制改密：先写入会话（以便 change-password 携带用户令牌），再弹出改密框
        setSession(r.token, r.user)
        setPendingToken(r.token)
        setOldPwd(password)
        setNewPwd('')
        setConfirmPwd('')
        setChangeError('')
        setPendingUser(r.user)
      } else {
        setSession(r.token, r.user)
        navigate('/dashboard', { replace: true })
      }
    } catch (e) {
      setError((e as Error).message || '登录失败')
    } finally {
      setLoading(false)
    }
  }

  const submitChange = async () => {
    setChangeError('')
    if (newPwd.length < 8) {
      setChangeError('新密码至少 8 位')
      return
    }
    if (newPwd !== confirmPwd) {
      setChangeError('两次输入的新密码不一致')
      return
    }
    if (newPwd === oldPwd) {
      setChangeError('新密码不能与默认密码相同')
      return
    }
    setChanging(true)
    try {
      await api.auth.changePassword(oldPwd, newPwd)
      const updated: SafeUser = { ...pendingUser!, mustChangePassword: false }
      setSession(pendingToken, updated)
      setPendingUser(null)
      navigate('/dashboard', { replace: true })
    } catch (e) {
      setChangeError((e as Error).message || '修改失败')
    } finally {
      setChanging(false)
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: theme.palette.background.default,
        p: 2,
      }}
    >
      <Paper
        elevation={8}
        sx={{
          width: '100%',
          maxWidth: 400,
          p: 4,
          borderRadius: 3,
          bgcolor: theme.palette.background.paper,
        }}
      >
        <Stack alignItems="center" spacing={2} mb={3}>
          <Logo size={48} withText={false} />
          <Box textAlign="center">
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              运维全维度管理平台
            </Typography>
            <Typography variant="caption" color="text.secondary">
              请登录后继续
            </Typography>
          </Box>
        </Stack>

        {error && (
          <MuiAlert severity="error" sx={{ mb: 2 }}>
            {error}
          </MuiAlert>
        )}

        <Stack spacing={2}>
          <TextField
            label="用户名"
            size="small"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
            autoFocus
            InputProps={{ startAdornment: <IconLock fontSize="small" sx={{ mr: 1, color: theme.palette.text.disabled }} /> }}
          />
          <TextField
            label="密码"
            type="password"
            size="small"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
          />
          <Button
            variant="contained"
            size="large"
            startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <IconLogin />}
            onClick={() => void submit()}
            disabled={loading}
          >
            {loading ? '登录中…' : '登录'}
          </Button>
        </Stack>
      </Paper>

      <Dialog open={pendingUser !== null} fullWidth maxWidth="xs" onClose={() => {}}>
        <DialogTitle>首次登录 · 请修改默认密码</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            检测到您正在使用系统预设的默认密码，出于安全要求，请先设置新密码后才能继续使用。
          </Typography>
          <Stack spacing={2}>
            {changeError && <MuiAlert severity="error">{changeError}</MuiAlert>}
            <TextField
              label="新密码（至少 8 位）"
              type="password"
              size="small"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
            />
            <TextField
              label="确认新密码"
              type="password"
              size="small"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void submitChange()}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => void submitChange()} variant="contained" disabled={changing}>
            {changing ? '提交中…' : '确认修改'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}