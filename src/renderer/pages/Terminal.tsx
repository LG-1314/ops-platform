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
  Chip,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { Terminal as IconTerminal, LinkOff as IconDisconnect, PlayArrow as IconConnect, Logout as IconExit } from '@mui/icons-material'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { terminalWsUrl, api, USER_TOKEN_KEY } from '../../capabilities/bus'
import type { Credential } from '@shared/types'

type ConnState = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

// 深色主题下 xterm 专用配色：与全局深色背景 #0B0E14 / #141923 对齐
const XTERM_THEME = {
  background: '#0B0E14',
  foreground: '#D6E1F5',
  cursor: '#3D7BFF',
  cursorAccent: '#0B0E14',
  selectionBackground: 'rgba(61,123,255,0.35)',
  black: '#1B2333',
  red: '#F87171',
  green: '#34D399',
  yellow: '#F59E0B',
  blue: '#60A5FA',
  magenta: '#C084FC',
  cyan: '#22D3EE',
  white: '#D6E1F5',
  brightBlack: '#5C6B8A',
  brightRed: '#FCA5A5',
  brightGreen: '#6EE7B7',
  brightYellow: '#FCD34D',
  brightBlue: '#93C5FD',
  brightMagenta: '#D8B4FE',
  brightCyan: '#67E8F9',
  brightWhite: '#FFFFFF',
}

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
  const [error, setError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const termRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const tokenRef = useRef<string>('')

  // 初始化 xterm 实例（仅一次）
  useEffect(() => {
    if (termRef.current || !containerRef.current) return
    const term = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'JetBrains Mono, Menlo, Consolas, monospace',
      lineHeight: 1.2,
      scrollback: 5000,
      convertEol: false,
      theme: XTERM_THEME,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    try {
      fit.fit()
    } catch {
      /* 容器尺寸未定，等 ResizeObserver 再 fit */
    }
    termRef.current = term
    fitRef.current = fit

    // 用户键盘输入 → WS
    term.onData((data) => {
      const ws = wsRef.current
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(data)
    })

    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
        const ws = wsRef.current
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
        }
      } catch {
        /* ignore */
      }
    })
    ro.observe(containerRef.current)
    return () => {
      ro.disconnect()
      // 关键：卸载时必须关闭 WS，否则服务端 shell 进程残留，
      // 重新进入会叠加第二个连接 → 输出写入已销毁的 xterm → 界面异常
      try {
        if (wsRef.current && wsRef.current.readyState < WebSocket.CLOSING) wsRef.current.close()
      } catch {
        /* ignore */
      }
      wsRef.current = null
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [])

  // 取回能力总线令牌（终端 WS 鉴权用）
  const getToken = async (): Promise<string> => {
    if (tokenRef.current) return tokenRef.current
    try {
      tokenRef.current = (await window.opsApi?.token?.()) || ''
    } catch {
      tokenRef.current = ''
    }
    return tokenRef.current
  }

  useEffect(() => {
    api.credentials
      .list()
      .then((c) => setCreds(c.filter((x) => x.kind === 'ssh')))
      .catch((e) => setError((e as Error).message || '加载凭据失败'))
  }, [])

  async function connect(h: string, p: string, cid: string, n: string) {
    setError(null)
    setConnState('connecting')
    const term = termRef.current
    term?.reset()
    term?.writeln(`\x1b[90m正在连接 ${n || h}:${p || 22} …\x1b[0m`)

    // 关键：连接前关闭旧连接，避免残留 shell 叠加导致输出混乱
    try {
      if (wsRef.current && wsRef.current.readyState < WebSocket.CLOSING) wsRef.current.close()
    } catch {
      /* ignore */
    }
    wsRef.current = null

    const token = await getToken()
    let userToken = ''
    try {
      userToken = localStorage.getItem(USER_TOKEN_KEY) || ''
    } catch {
      userToken = ''
    }
    const cols = term?.cols || 80
    const rows = term?.rows || 24
    const url = terminalWsUrl({ host: h, port: p, credentialId: cid || undefined, cols, rows }, token, userToken)
    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    } catch (e) {
      setConnState('error')
      setError((e as Error).message)
      term?.writeln('\x1b[31m[终端] 无法建立连接\x1b[0m')
      return
    }
    wsRef.current = ws
    // 服务端按二进制帧透传（避免 UTF-8 分块截断），前端必须按二进制接收
    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      setConnState('open')
      // 服务端 shell 建立后首帧回显会包含尺寸信息；主动同步一次尺寸
      ws.send(JSON.stringify({ type: 'resize', cols, rows }))
    }
    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        term?.write(ev.data)
      } else {
        // ArrayBuffer → Uint8Array 写入 xterm（支持全量 UTF-8 字符）
        try {
          term?.write(new Uint8Array(ev.data as ArrayBuffer))
        } catch {
          /* ignore */
        }
      }
    }
    ws.onerror = () => {
      setConnState('error')
      setError('连接出错：目标主机不可达或 SSH 服务拒绝连接，请检查主机/端口/凭据')
      term?.writeln('\x1b[31m[终端] 连接出错\x1b[0m')
      try {
        ws.close()
      } catch {
        /* ignore */
      }
    }
    ws.onclose = () => {
      setConnState('closed')
      term?.writeln('\r\n\x1b[90m[连接已关闭]\x1b[0m\r\n')
      if (wsRef.current === ws) wsRef.current = null
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

  // 记录当前已连接的主机签名，host 参数变化（如从主机页跳转）时自动重连
  const lastConnRef = useRef('')
  useEffect(() => {
    const sig = `${host}:${port}:${credentialId}`
    if (host && lastConnRef.current !== sig) {
      lastConnRef.current = sig
      void connect(host, port, credentialId, name)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, port, credentialId])

  function disconnect() {
    try {
      wsRef.current?.close()
    } catch {
      /* ignore */
    }
    wsRef.current = null
    setConnState('closed')
  }

  /** 正常退出会话：向远端 shell 发送 exit 命令，由服务端自动关闭连接 */
  function sendExit() {
    const ws = wsRef.current
    const term = termRef.current
    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        term?.writeln('\x1b[90m[退出会话] exit\x1b[0m\r\n')
        ws.send('exit\r')
      } else {
        disconnect()
      }
    } catch {
      disconnect()
    }
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
            经由能力总线桥接到目标主机 shell（xterm-256color 全功能终端）
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
          height: '68vh',
          bgcolor: '#0B0E14',
          border: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Box ref={containerRef} sx={{ flex: 1, p: 1, minHeight: 0 }} />
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            p: 1,
            borderTop: `1px solid ${theme.palette.divider}`,
            bgcolor: '#0E1320',
          }}
        >
          <IconTerminal fontSize="small" sx={{ color: '#5C6B8A' }} />
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
            {connState === 'open' ? '已连接，直接键入命令执行（支持全屏终端程序如 vim/top）' : '未连接'}
          </Typography>
          {connState === 'open' ? (
            <Stack direction="row" spacing={1}>
              <Button size="small" variant="outlined" startIcon={<IconExit />} onClick={sendExit}>
                退出会话
              </Button>
              <Button size="small" color="error" startIcon={<IconDisconnect />} onClick={disconnect}>
                断开
              </Button>
            </Stack>
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
