import { useState, useRef, useEffect } from 'react'
import {
  AppBar,
  Toolbar,
  Box,
  InputBase,
  Badge,
  IconButton,
  Typography,
  Avatar,
  useTheme,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Chip,
} from '@mui/material'
import {
  Search,
  Notifications,
  Menu as IconMenu,
  AdminPanelSettings,
  Person,
  Check,
  Logout,
  Key as IconKey,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import { useUserRole, useSetUserRole, useUser, clearSession, updateUserInfo } from '../state/userRole'
import type { UserRole } from '@shared/types'
import { api } from '../../capabilities/bus'
import ChangePasswordDialog from './ChangePasswordDialog'

interface Props {
  onMenu: () => void
  alertCount?: number
}

const ROLE_LABEL: Record<UserRole, string> = {
  admin: '运维管理员',
  personal: '个人用户',
}

export default function TopBar({ onMenu, alertCount = 0 }: Props) {
  const theme = useTheme()
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')
  const isDark = theme.palette.mode === 'dark'

  const role = useUserRole()
  const setRole = useSetUserRole()
  const user = useUser()

  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const avatarRef = useRef<HTMLDivElement | null>(null)
  // 修改密码弹窗：首次登录强制改密（mustChangePassword）自动弹出
  const [pwdOpen, setPwdOpen] = useState(false)
  useEffect(() => {
    if (user?.mustChangePassword) setPwdOpen(true)
  }, [user?.mustChangePassword])

  const onPasswordChanged = async () => {
    updateUserInfo({ mustChangePassword: false })
    try {
      const me = await api.auth.me().catch(() => null)
      if (me) updateUserInfo(me)
    } catch {
      /* ignore */
    }
  }

  const goSearch = () => {
    const q = keyword.trim()
    navigate(q ? `/knowledge?q=${encodeURIComponent(q)}` : '/knowledge')
  }

  const onPickRole = (r: UserRole) => {
    setRole(r)
    setAnchorEl(null)
    // 切换身份后回到仪表盘，避免停留在当前身份不可见的页面
    navigate('/dashboard')
  }

  const onLogout = async () => {
    setAnchorEl(null)
    try {
      await api.auth.logout().catch(() => {})
    } catch {
      /* ignore */
    }
    clearSession()
    navigate('/login', { replace: true })
  }

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        bgcolor: theme.palette.background.paper,
        color: theme.palette.text.primary,
        borderBottom: `1px solid ${theme.palette.divider}`,
      }}
    >
      <Toolbar sx={{ gap: 2 }}>
        <IconButton onClick={onMenu} sx={{ color: theme.palette.text.secondary }} size="small">
          <IconMenu />
        </IconButton>

        <Box
          sx={{
            position: 'relative',
            bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
            borderRadius: 2,
            px: 1.5,
            py: 0.6,
            display: 'flex',
            alignItems: 'center',
            width: { xs: '100%', md: 360 },
            border: `1px solid transparent`,
            transition: 'border-color 0.2s, background 0.2s',
            '&:hover': { borderColor: theme.palette.divider },
            '&:focus-within': {
              borderColor: theme.palette.primary.main,
              bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
            },
          }}
        >
          <Search sx={{ color: theme.palette.text.disabled, fontSize: 20 }} />
          <InputBase
            placeholder="搜索资产 / 知识 / 工单…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && goSearch()}
            sx={{ ml: 1, flex: 1, fontSize: 13, color: theme.palette.text.primary }}
          />
        </Box>

        <Box sx={{ flexGrow: 1 }} />

        <IconButton
          sx={{
            color: theme.palette.text.secondary,
            '&:hover': { color: theme.palette.primary.main, bgcolor: 'action.hover' },
          }}
          size="small"
          onClick={() => navigate('/alerts')}
          aria-label="查看告警"
        >
          <Badge badgeContent={alertCount} color="error">
            <Notifications />
          </Badge>
        </IconButton>

        {/* 身份切换：可点击，弹菜单在「运维管理员 / 个人用户」间切换 */}
        <Box
          ref={avatarRef}
          onClick={(e) => setAnchorEl(e.currentTarget)}
          role="button"
          aria-haspopup="menu"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1,
            py: 0.5,
            borderRadius: 2,
            border: `1px solid ${theme.palette.divider}`,
            bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.03)',
            cursor: 'pointer',
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          <Avatar
            sx={{
              width: 30,
              height: 30,
              bgcolor: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.info.main})`,
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {user?.displayName?.[0] || (role === 'admin' ? '运' : '个')}
          </Avatar>
          <Box sx={{ display: { xs: 'none', md: 'block' }, lineHeight: 1.1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
              {user?.displayName || ROLE_LABEL[role]}
            </Typography>
            <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
              {user?.username || role} · {role === 'admin' ? '全部模块' : '常用模块'}
            </Typography>
          </Box>
          <Chip
            size="small"
            label={role === 'admin' ? '管理员' : '个人'}
            sx={{ display: { xs: 'none', lg: 'flex' }, ml: 0.5, height: 20, fontSize: 11 }}
            color={role === 'admin' ? 'primary' : 'default'}
            variant="outlined"
          />
        </Box>

        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={() => setAnchorEl(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <MenuItem selected={role === 'admin'} onClick={() => onPickRole('admin')}>
            <ListItemIcon>
              <AdminPanelSettings fontSize="small" color={role === 'admin' ? 'primary' : 'inherit'} />
            </ListItemIcon>
            <ListItemText
              primary="运维管理员"
              secondary="完整视图：全部模块与高级能力"
            />
            {role === 'admin' && <Check fontSize="small" color="primary" />}
          </MenuItem>
          <MenuItem selected={role === 'personal'} onClick={() => onPickRole('personal')}>
            <ListItemIcon>
              <Person fontSize="small" color={role === 'personal' ? 'primary' : 'inherit'} />
            </ListItemIcon>
            <ListItemText
              primary="个人用户"
              secondary="精简视图：仪表盘 / 主机 / 告警 / 终端 / 设置"
            />
            {role === 'personal' && <Check fontSize="small" color="primary" />}
          </MenuItem>
          <Box sx={{ borderTop: `1px solid ${theme.palette.divider}`, my: 0.5 }} />
          <MenuItem onClick={() => { setAnchorEl(null); setPwdOpen(true) }}>
            <ListItemIcon>
              <IconKey fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="修改密码" secondary="定期更换更安全" />
          </MenuItem>
          <MenuItem onClick={() => void onLogout()}>
            <ListItemIcon>
              <Logout fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="退出登录" secondary={user ? `当前：${user.username}` : ''} />
          </MenuItem>
        </Menu>
        <ChangePasswordDialog open={pwdOpen} onClose={() => setPwdOpen(false)} force={user?.mustChangePassword} onChanged={onPasswordChanged} />
      </Toolbar>
    </AppBar>
  )
}
