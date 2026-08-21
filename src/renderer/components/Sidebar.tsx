import {
  Drawer,
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  IconButton,
  Divider,
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
  Construction as IconTools,
  MonitorHeart as IconMonitor,
  ManageAccounts as IconUsers,
  Shield as IconFirewall,
  ChevronLeft,
  ChevronRight,
} from '@mui/icons-material'
import { NavLink } from 'react-router-dom'
import Logo from './Logo'
import { useUserRole } from '../state/userRole'
import type { UserRole } from '@shared/types'

const DRAWER_WIDTH = 232
const DRAWER_COLLAPSED = 64

// 导航配色集中管理，强调色对齐全局主题主色（design-tokens.json: primary #3D7BFF），
// 消除散落硬编码，保证与全局 UI 同源（详见 docs/修复实施记录.md §2.4）。
const NAV_BG = '#0F1B3D'
const NAV_FG = '#E5EAF5'
const NAV_TEXT = '#C7D0E8'
const NAV_TEXT_MUTED = '#9AA7C7'
const NAV_ACTIVE_BG = 'rgba(61,123,255,0.18)'
const NAV_ACTIVE_TEXT = '#FFFFFF'
const NAV_ACTIVE_ICON = '#3D7BFF'

interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
  /** 哪些身份可见；缺省 = 全部可见 */
  roles?: UserRole[]
}

// 导航按业务逻辑分组（总览 → 资源 → 操作 → 知识 → 系统），顺序即侧边栏展示顺序。
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: '总览',
    items: [
      { to: '/dashboard', label: '仪表盘', icon: <IconDashboard /> },
      { to: '/monitor', label: '监控大盘', icon: <IconMonitor /> },
      { to: '/hosts', label: '主机', icon: <IconHosts /> },
    ],
  },
  {
    title: '运维操作',
    items: [
      { to: '/terminal', label: '终端', icon: <IconTerminal /> },
      { to: '/alerts', label: '告警中心', icon: <IconAlerts /> },
    ],
  },
  {
    title: '基础设施',
    items: [
      { to: '/assets', label: '资产', icon: <IconAssets />, roles: ['admin'] },
      { to: '/clusters', label: '集群', icon: <IconClusters />, roles: ['admin'] },
      { to: '/databases', label: '数据库', icon: <IconDatabases />, roles: ['admin'] },
      { to: '/firewall', label: '防火墙', icon: <IconFirewall />, roles: ['admin'] },
      { to: '/cloud', label: '云资源', icon: <IconCloud />, roles: ['admin'] },
    ],
  },
  {
    title: '主动运维',
    items: [
      { to: '/diagnostics', label: '系统体检', icon: <IconDiagnostics />, roles: ['admin'] },
      { to: '/patrols', label: '智能巡检', icon: <IconPatrols />, roles: ['admin'] },
      { to: '/automation', label: '自动化', icon: <IconAutomation />, roles: ['admin'] },
      { to: '/ops-tools', label: '运维工具箱', icon: <IconTools />, roles: ['admin'] },
    ],
  },
  {
    title: '知识协作',
    items: [
      { to: '/knowledge', label: '知识检索', icon: <IconKnowledge />, roles: ['admin'] },
      { to: '/relations', label: '关联视图', icon: <IconRelation />, roles: ['admin'] },
    ],
  },
  {
    title: '系统',
    items: [
      { to: '/users', label: '用户管理', icon: <IconUsers />, roles: ['admin'] },
      { to: '/settings', label: '设置', icon: <IconSettings /> },
    ],
  },
]

interface Props {
  open: boolean
  onToggle: () => void
}

export default function Sidebar({ open, onToggle }: Props) {
  const role = useUserRole()
  // 过滤每个分组的可见项（缺省全可见，标注 roles 的按角色过滤），隐藏空分组
  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.roles || i.roles.includes(role)),
  })).filter((g) => g.items.length > 0)

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: open ? DRAWER_WIDTH : DRAWER_COLLAPSED,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: open ? DRAWER_WIDTH : DRAWER_COLLAPSED,
          boxSizing: 'border-box',
          bgcolor: NAV_BG,
          color: NAV_FG,
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

      <Box sx={{ px: open ? 1 : 0.5, mt: 1, overflowY: 'auto', overflowX: 'hidden', flex: 1 }}>
        {groups.map((group, gi) => (
          <Box key={group.title}>
            {gi > 0 && (
              <Divider
                sx={{
                  borderColor: 'rgba(255,255,255,0.08)',
                  my: 1,
                  ...(open ? {} : { mx: 1 }),
                }}
              />
            )}
            <List disablePadding>
              {group.items.map((item) => (
                <ListItemButton
                  key={item.to}
                  component={NavLink}
                  to={item.to}
                  sx={{
                    borderRadius: 2,
                    mb: 0.5,
                    justifyContent: open ? 'flex-start' : 'center',
                    px: open ? 2 : 0,
                    color: NAV_TEXT,
                    '&.active': {
                      bgcolor: NAV_ACTIVE_BG,
                      color: NAV_ACTIVE_TEXT,
                      '& .MuiListItemIcon-root': { color: NAV_ACTIVE_ICON },
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
          </Box>
        ))}
      </Box>

      <Box sx={{ flexGrow: 0 }} />
      <IconButton
        onClick={onToggle}
        sx={{ color: NAV_TEXT_MUTED, mx: 'auto', mb: 1 }}
        size="small"
      >
        {open ? <ChevronLeft /> : <ChevronRight />}
      </IconButton>
    </Drawer>
  )
}
