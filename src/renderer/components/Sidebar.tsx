import {
  Drawer,
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Toolbar,
  Collapse,
  IconButton,
} from '@mui/material'
import {
  Dashboard as IconDashboard,
  MonitorHeart as IconDiagnostics,
  Search as IconKnowledge,
  AccountTree as IconRelation,
  Storage as IconAssets,
  Notifications as IconAlerts,
  Schedule as IconPatrols,
  MiscellaneousServices as IconAutomation,
  Dns as IconClusters,
  Settings as IconSettings,
  Cloud as IconCloud,
  Terminal as IconTerminal,
  Computer as IconHosts,
  BackupTable as IconDatabases,
  ChevronLeft,
  ChevronRight,
} from '@mui/icons-material'
import { NavLink } from 'react-router-dom'
import Logo from './Logo'

const DRAWER_WIDTH = 232
const DRAWER_COLLAPSED = 64

interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
}

const NAV: NavItem[] = [
  { to: '/dashboard', label: '仪表盘', icon: <IconDashboard /> },
  { to: '/diagnostics', label: '系统体检', icon: <IconDiagnostics /> },
  { to: '/knowledge', label: '知识检索', icon: <IconKnowledge /> },
  { to: '/relations', label: '关联视图', icon: <IconRelation /> },
  { to: '/assets', label: '资产', icon: <IconAssets /> },
  { to: '/alerts', label: '告警中心', icon: <IconAlerts /> },
  { to: '/patrols', label: '智能巡检', icon: <IconPatrols /> },
  { to: '/automation', label: '自动化', icon: <IconAutomation /> },
  { to: '/clusters', label: '集群', icon: <IconClusters /> },
  { to: '/databases', label: '数据库', icon: <IconDatabases /> },
  { to: '/cloud', label: '云资源', icon: <IconCloud /> },
  { to: '/hosts', label: '主机', icon: <IconHosts /> },
  { to: '/terminal', label: '终端', icon: <IconTerminal /> },
  { to: '/settings', label: '设置', icon: <IconSettings /> },
]

interface Props {
  open: boolean
  onToggle: () => void
}

export default function Sidebar({ open, onToggle }: Props) {
  return (
    <Drawer
      variant="permanent"
      sx={{
        width: open ? DRAWER_WIDTH : DRAWER_COLLAPSED,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: open ? DRAWER_WIDTH : DRAWER_COLLAPSED,
          boxSizing: 'border-box',
          bgcolor: '#0F1B3D',
          color: '#E5EAF5',
          borderRight: 'none',
          transition: 'width 0.2s ease',
          overflowX: 'hidden',
        },
      }}
    >
      <Toolbar
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: open ? 2 : 0,
          justifyContent: open ? 'flex-start' : 'center',
          minHeight: 64,
        }}
      >
        <Logo size={30} withText={open} />
      </Toolbar>

      <List sx={{ px: open ? 1 : 0.5, mt: 1 }}>
        {NAV.map((item) => (
          <ListItemButton
            key={item.to}
            component={NavLink}
            to={item.to}
            sx={{
              borderRadius: 2,
              mb: 0.5,
              justifyContent: open ? 'flex-start' : 'center',
              px: open ? 2 : 0,
              color: '#C7D0E8',
              '&.active': {
                bgcolor: 'rgba(124,156,255,0.18)',
                color: '#fff',
                '& .MuiListItemIcon-root': { color: '#7C9CFF' },
              },
              '&:hover': { bgcolor: 'rgba(255,255,255,0.06)', color: '#fff' },
            }}
          >
            <ListItemIcon
              sx={{ color: 'inherit', minWidth: open ? 36 : 'auto' }}
            >
              {item.icon}
            </ListItemIcon>
            {open && <ListItemText primary={item.label} />}
          </ListItemButton>
        ))}
      </List>

      <Box sx={{ flexGrow: 1 }} />
      <IconButton
        onClick={onToggle}
        sx={{ color: '#9AA7C7', mx: 'auto', mb: 1 }}
        size="small"
      >
        {open ? <ChevronLeft /> : <ChevronRight />}
      </IconButton>
    </Drawer>
  )
}
