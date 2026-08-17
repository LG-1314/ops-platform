import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Box,
  Paper,
  Typography,
  Button,
  Stack,
  Alert,
  TextField,
  MenuItem,
  CircularProgress,
  Chip,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { Terminal as IconTerminal, LinkOff as IconDisconnect, PlayArrow as IconConnect } from '@mui/icons-material'
import { terminalWsUrl, api } from '../../capabilities/bus'
import type { Credential } from '@shared/types'

type ConnState = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

export default function Terminal() {
  const theme = useTheme()
  const [params, setParams] = useSearchParams()

  const host = params.get('host') || ''
  const port = params.get('port') || '22'
  const credentialId = params.get('credentialId') || ''
  const name = params.get('name') || host

  const [creds, setCreds] = useState<Credential[]>([])
  const [formHost, setFormHost] = useState(host)
  const [formPort, setFormPort] = useState(port)
  const [formCred, setFormCred] = useState(credentialId)
  const [formName, setFormName] = useState(name)

  const [connState, setConnState] = useState<ConnState>(host ? 'connecting' : 'idle')
  const [output, setOutput] = useState('')
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<HTMLDivElement | null>(null)
  const dimsRef = useRef({ cols: 80, rows: 24 })

  // 加载 SSH 凭据，供手动连接时选择
  useEffect(() => {
    api.credentials
      .list()
      .then((c) => setCreds(c.filter((x) => x.kind === 'ssh')))
      .catch(() => {})
  }, [])

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [output])

  // 估算终端尺寸并发送 resize
  useEffect(() => {
    const el = termRef.current
    if (!el) return
    const measure = () => {
      const cs = getComputedStyle(el)
      const fontSize = parseFloat(cs.fontSize) || 13
      const lineHeight = parseFloat(cs.lineHeight) || fontSize * 1.5
      const charWidth = fontSize * 0.6
      const cols = Math.max(20, Math.floor(el.clientWidth / charWidth))
      const rows = Math.max(8, Math.floor(el.clientHeight / lineHeight))
      if (cols !== dimsRef.current.cols || rows !== dimsRef.current.rows) {
        dimsRef.current = { cols, rows }
        const ws = wsRef.current
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols, rows }))
        }
      }
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [connState])

  function connect(h: string, p: string, cid: string, n: string) {
    setError(null)
    setOutput('')
    setConnState('connecting')
    const url = terminalWsUrl({ host: h, port: p, credentialId: cid || undefined, cols: dimsRef.current.cols, rows: dimsRef.current.rows })
    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    } catch (e) {
      setConnState('error')
      setError((e as Error).message)
      return
    }
    wsRef.current = ws
    ws.onopen = () => setConnState('open')
    ws.onmessage = (ev) => setOutput((o) => o + ev.data)
    ws.onerror = () => {
      setConnState('error')
    }
    ws.onclose = () => {
      setConnState('closed')
      setOutput((o) => o + '\r\n[连接已关闭]\r\n')
    }
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('host', h)
        next.set('port', p)
        next.set('name', n || h)
        if (cid) next.set('credentialId', cid)
        else next.delete('credentialId')
        return next
      },
      { replace: true }
    )
  }

  // 带 host 参数时自动连接
  useEffect(() => {
    if (host) {
      connect(host, port, credentialId, name)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function disconnect() {
    try {
      wsRef.current?.close()
    } catch {
      /* ignore */
    }
    wsRef.current = null
    setConnState('closed')
  }

  function sendLine() {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    const line = input
    ws.send(line + '\n')
    setInput('')
  }

  function onManualConnect() {
    if (!formHost) {
      setError('请填写主机地址')
      return
    }
    connect(formHost, formPort, formCred, formName)
  }

  const stateColor =
    connState === 'open'
      ? theme.palette.success.main
      : connState === 'connecting'
      ? theme.palette.warning.main
      : connState === 'error' || connState === 'closed'
      ? theme.palette.error.main
      : theme.palette.text.secondary

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            SSH 终端
          </Typography>
          <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
            经由能力总线桥接到目标主机 shell，输入随行发送
          </Typography>
        </Box>
        <Chip
          size="small"
          label={
            connState === 'open'
              ? '已连接'
              : connState === 'connecting'
              ? '连接中…'
              : connState === 'error'
              ? '连接错误'
              : connState === 'closed'
              ? '已断开'
              : '未连接'
          }
          sx={{ bgcolor: stateColor + '22', color: stateColor, border: `1px solid ${stateColor}` }}
        />
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {!host && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="flex-end">
            <TextField label="主机" value={formHost} onChange={(e) => setFormHost(e.target.value)} sx={{ flex: 2 }} />
            <TextField label="端口" value={formPort} onChange={(e) => setFormPort(e.target.value)} sx={{ width: 100 }} />
            <TextField
              label="SSH 凭据"
              select
              value={formCred}
              onChange={(e) => setFormCred(e.target.value)}
              sx={{ flex: 2 }}
            >
              <MenuItem value="">无（按需输入账号）</MenuItem>
              {creds.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name} ({c.username || '-'})
                </MenuItem>
              ))}
            </TextField>
            <TextField label="名称" value={formName} onChange={(e) => setFormName(e.target.value)} sx={{ flex: 1 }} />
            <Button variant="contained" startIcon={<IconConnect />} onClick={onManualConnect} disabled={!formHost}>
              连接
            </Button>
          </Stack>
        </Paper>
      )}

      <Paper
        sx={{
          p: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          height: '64vh',
          bgcolor: '#0B0E14',
          border: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Box
          ref={scrollRef}
          sx={{
            flex: 1,
            overflowY: 'auto',
            p: 1.5,
            fontFamily: 'JetBrains Mono, Menlo, Consolas, monospace',
            fontSize: 13,
            lineHeight: 1.5,
            color: '#D6E1F5',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {connState === 'connecting' && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#8A98B8' }}>
              <CircularProgress size={14} /> 正在连接 {name || host} …
            </Box>
          )}
          {output}
        </Box>
        <Box ref={termRef} sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, borderTop: `1px solid ${theme.palette.divider}`, bgcolor: '#0E1320' }}>
          <IconTerminal fontSize="small" sx={{ color: '#5C6B8A' }} />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                sendLine()
              }
            }}
            disabled={connState !== 'open'}
            placeholder={connState === 'open' ? '输入命令后回车执行…' : '未连接'}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#D6E1F5',
              fontFamily: 'JetBrains Mono, Menlo, Consolas, monospace',
              fontSize: 13,
            }}
          />
          {connState === 'open' ? (
            <Button size="small" color="error" startIcon={<IconDisconnect />} onClick={disconnect}>
              断开
            </Button>
          ) : (
            host && (
              <Button size="small" variant="contained" startIcon={<IconConnect />} onClick={() => connect(host, port, credentialId, name)}>
                重连
              </Button>
            )
          )}
        </Box>
      </Paper>
    </Box>
  )
}
