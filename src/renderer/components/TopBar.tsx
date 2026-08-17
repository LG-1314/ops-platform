import { useState } from 'react'
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
} from '@mui/material'
import { Search, Notifications, Menu } from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'

interface Props {
  onMenu: () => void
  alertCount?: number
}

export default function TopBar({ onMenu, alertCount = 0 }: Props) {
  const theme = useTheme()
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')
  const isDark = theme.palette.mode === 'dark'

  const goSearch = () => {
    const q = keyword.trim()
    navigate(q ? `/knowledge?q=${encodeURIComponent(q)}` : '/knowledge')
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
          <Menu />
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
            '&:hover': {
              borderColor: theme.palette.divider,
            },
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

        <Box
          display="flex"
          alignItems="center"
          gap={1}
          sx={{
            px: 1,
            py: 0.5,
            borderRadius: 2,
            border: `1px solid ${theme.palette.divider}`,
            bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.03)',
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
            运
          </Avatar>
          <Box sx={{ display: { xs: 'none', md: 'block' }, lineHeight: 1.1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
              运维管理员
            </Typography>
            <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
              admin@ops
            </Typography>
          </Box>
        </Box>
      </Toolbar>
    </AppBar>
  )
}
