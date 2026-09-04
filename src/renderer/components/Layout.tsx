import { Box, CssBaseline } from '@mui/material'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { api } from '../../capabilities/bus'
import { REFRESH_ALERT_MS } from '@shared/constants'

export default function Layout() {
  const [open, setOpen] = useState(true)
  const [alertCount, setAlertCount] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadAlerts = useCallback(() => {
    api.alerts
      .list(undefined, 'active')
      .then((list) => setAlertCount(list.length))
      .catch((e) => console.warn('[layout] 告警轮询失败:', e))
  }, [])

  useEffect(() => {
    loadAlerts()

    const startTimer = () => {
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = setInterval(loadAlerts, REFRESH_ALERT_MS)
    }
    const stopTimer = () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }

    startTimer()

    const onVisibility = () => {
      if (document.hidden) stopTimer()
      else startTimer()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      stopTimer()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [loadAlerts])

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
