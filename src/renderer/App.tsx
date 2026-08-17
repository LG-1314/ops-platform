import { lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Box, CircularProgress, Typography } from '@mui/material'
import Layout from './components/Layout'
// 默认路由（仪表盘）同步导入：避免从 file:// 加载时 lazy chunk 失败导致首屏黑屏
import Dashboard from './pages/Dashboard'

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

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={page(<Dashboard />)} />
        <Route path="diagnostics" element={page(<Diagnostics />)} />
        <Route path="knowledge" element={page(<Knowledge />)} />
        <Route path="relations" element={page(<Relation />)} />
        <Route path="assets" element={page(<Assets />)} />
        <Route path="alerts" element={page(<Alerts />)} />
        <Route path="patrols" element={page(<Patrols />)} />
        <Route path="automation" element={page(<Automation />)} />
        <Route path="clusters" element={page(<Clusters />)} />
        <Route path="databases" element={page(<Databases />)} />
        <Route path="cloud" element={page(<Cloud />)} />
        <Route path="hosts" element={page(<Hosts />)} />
        <Route path="terminal" element={page(<Terminal />)} />
        <Route path="settings" element={page(<Settings />)} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  )
}
