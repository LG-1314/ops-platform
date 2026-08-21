import { lazy, Suspense, useEffect } from 'react'
import type { ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Box, CircularProgress, Typography } from '@mui/material'
import Layout from './components/Layout'
// 默认路由（仪表盘）同步导入：避免从 file:// 加载时 lazy chunk 失败导致首屏黑屏
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import { useUserRole, useIsLoggedIn, clearSession } from './state/userRole'
import { onUnauthorized } from '../capabilities/bus'

// 管理员专属路由：个人用户访问时重定向回仪表盘
const ADMIN_ONLY = [
  '/diagnostics', '/knowledge', '/relations', '/assets', '/patrols',
  '/automation', '/clusters', '/databases', '/cloud', '/ops-tools', '/users',
]

// 其余路由级懒加载：减小非默认页面 JS 体积，按需拉取 chunk。
const Diagnostics = lazy(() => import('./pages/Diagnostics'))
const Knowledge = lazy(() => import('./pages/Knowledge'))
const Relation = lazy(() => import('./pages/Relation'))
const Assets = lazy(() => import('./pages/Assets'))
const Alerts = lazy(() => import('./pages/Alerts'))
const Patrols = lazy(() => import('./pages/Patrols'))
const Automation = lazy(() => import('./pages/Automation'))
const Clusters = lazy(() => import('./pages/Clusters'))
const Databases = lazy(() => import('./pages/Databases'))
const Cloud = lazy(() => import('./pages/Cloud'))
const Terminal = lazy(() => import('./pages/Terminal'))
const Hosts = lazy(() => import('./pages/Hosts'))
const Settings = lazy(() => import('./pages/Settings'))
const OpsTools = lazy(() => import('./pages/OpsTools'))
const Monitor = lazy(() => import('./pages/Monitor'))
const Users = lazy(() => import('./pages/Users'))

function PageFallback() {
  return (
    <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" py={10} gap={2}>
      <CircularProgress />
      <Typography variant="body2" color="text.secondary">
        页面加载中...
      </Typography>
    </Box>
  )
}

// 仅包裹页面内容，保持 Layout（侧边栏/顶栏）常驻不闪屏。
const page = (node: ReactNode) => (
  <Suspense fallback={<PageFallback />}>{node}</Suspense>
)

/** 登录守卫：未登录一律重定向登录页。 */
function AuthGate({ children }: { children: ReactNode }) {
  const loggedIn = useIsLoggedIn()
  if (!loggedIn) return <Navigate to="/login" replace />
  return <>{children}</>
}

/** 身份守卫：个人用户访问管理员专属路由 → 重定向回仪表盘。 */
function RoleGate({ path, node }: { path: string; node: ReactNode }) {
  const role = useUserRole()
  if (role === 'personal' && ADMIN_ONLY.includes(path)) {
    return <Navigate to="/dashboard" replace />
  }
  return <>{node}</>
}

export default function App() {
  // 全局 401 处理器：后端会话过期时清空本地会话 → AuthGate 自动跳登录页
  useEffect(() => {
    onUnauthorized(() => clearSession())
  }, [])

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <AuthGate>
            <Layout />
          </AuthGate>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={page(<Dashboard />)} />
        <Route path="diagnostics" element={page(<RoleGate path="/diagnostics" node={<Diagnostics />} />)} />
        <Route path="knowledge" element={page(<RoleGate path="/knowledge" node={<Knowledge />} />)} />
        <Route path="relations" element={page(<RoleGate path="/relations" node={<Relation />} />)} />
        <Route path="assets" element={page(<RoleGate path="/assets" node={<Assets />} />)} />
        <Route path="alerts" element={page(<Alerts />)} />
        <Route path="patrols" element={page(<RoleGate path="/patrols" node={<Patrols />} />)} />
        <Route path="automation" element={page(<RoleGate path="/automation" node={<Automation />} />)} />
        <Route path="clusters" element={page(<RoleGate path="/clusters" node={<Clusters />} />)} />
        <Route path="databases" element={page(<RoleGate path="/databases" node={<Databases />} />)} />
        <Route path="cloud" element={page(<RoleGate path="/cloud" node={<Cloud />} />)} />
        <Route path="hosts" element={page(<Hosts />)} />
        <Route path="terminal" element={page(<Terminal />)} />
        <Route path="ops-tools" element={page(<RoleGate path="/ops-tools" node={<OpsTools />} />)} />
        <Route path="monitor" element={page(<RoleGate path="/monitor" node={<Monitor />} />)} />
        <Route path="users" element={page(<RoleGate path="/users" node={<Users />} />)} />
        <Route path="settings" element={page(<Settings />)} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  )
}
