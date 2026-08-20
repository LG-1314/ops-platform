import { Box, CssBaseline } from '@mui/material'
import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { api } from '../../capabilities/bus'

export default function Layout() {
  const [open, setOpen] = useState(true)
  const [alertCount, setAlertCount] = useState(0)

  // 顶栏实时告警数：拉取 active 状态告警并每 15s 刷新
  useEffect(() => {
    let alive = true
    const load = () => {
      api.alerts
        .list(undefined, 'active')
        .then((list) => {
          if (alive) setAlertCount(list.length)
        })
        .catch(() => {})
    }
    load()
    const t = setInterval(load, 15000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <CssBaseline />
      <Sidebar open={open} onToggle={() => setOpen((o) => !o)} />
      <Box
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
        <TopBar onMenu={() => setOpen((o) => !o)} alertCount={alertCount} />
        <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  )
}
