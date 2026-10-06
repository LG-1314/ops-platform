import { useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Stack,
  Button,
  Chip,
  IconButton,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { Terminal as IconTerminal, LinkOff as IconDisconnect, PlayArrow as IconConnect, Logout as IconExit, Close as IconClose, OpenInNew as IconOpenInNew } from '@mui/icons-material'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { terminalWsUrl, USER_TOKEN_KEY } from '../../capabilities/bus'
import { useNavigate } from 'react-router-dom'

type ConnState = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

// 终端始终用深色配色（与业界 SSH 终端一致，浅色主题下也能清晰阅读）
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

interface Props {
  open: boolean
  host: string
  port?: number
  credentialId?: string
  name?: string
  onClose: () => void
}

const STATE_LABEL: Record<ConnState, string> = {
  idle: '未连接',
  connecting: '连接中…',
  open: '已连接',
  closed: '已断开',
  error: '连接错误',
}

/**
 * 页内 SSH 终端弹窗：在「监控大盘 / 主机」当前页打开，看完即关，不跳转终端页签。
 * 复用与 /terminal 相同的能力总线 WS 桥接逻辑。
 */
export default function TerminalDialog({ open, host, port, credentialId, name, onClose }: Props) {
  const theme = useTheme()
  const navigate = useNavigate()
  const [connState, setConnState] = useState<ConnState>('idle')
  const [error, setError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const termRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const tokenRef = useRef<string>('')
  // ResizeObserver 存 ref 而不是挂在 DOM 节点上：Dialog 卸载与 setTimeout 竞争时
  // containerRef 可能已为 null，挂在 DOM 上的 observer 会漏 disconnect
  const roRef = useRef<ResizeObserver | null>(null)
  // 弹窗存活标记：getToken() await 期间弹窗关闭时，connect 不得再建孤儿连接
  const aliveRef = useRef(false)

  // 打开时初始化 xterm 并自动连接
  useEffect(() => {
    if (!open) return
    aliveRef.current = true
    setError(null)
    if (!host) {
      setConnState('idle')
      return
    }
    // 确保容器已挂载后再初始化；容器未挂载则跳过本次连接（避免 WS 建立后无处写入）
    const t = setTimeout(() => {
      if (!aliveRef.current) return
      if (!containerRef.current) {
        setError('终端容器尚未就绪，请关闭后重试')
        return
      }
      initTerm()
      void connect(host, port, credentialId, name)
    }, 30)
    return () => {
      aliveRef.current = false
      clearTimeout(t)
      cleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, host, port, credentialId, name])

  function initTerm() {
    if (termRef.current || !containerRef.current) return
    const term = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'JetBrains Mono, Menlo, Consolas, monospace',
      lineHeight: 1.2,
      scrollback: 3000,
      convertEol: false,
      theme: XTERM_THEME,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    try {
      fit.fit()
    } catch {
      /* 容器尺寸未定 */
    }
    termRef.current = term
    fitRef.current = fit

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
    roRef.current = ro
  }

  const getToken = async (): Promise<string> => {
    if (tokenRef.current) return tokenRef.current
    try {
      tokenRef.current = (await window.opsApi?.token?.()) || ''
    } catch {
      tokenRef.current = ''
    }
    return tokenRef.current
  }

  async function connect(h: string, p?: number, cid?: string, n?: string) {
    setError(null)
    setConnState('connecting')
    const term = termRef.current
    term?.reset()
    term?.writeln(`\x1b[90m正在连接 ${n || h}:${p || 22} …\x1b[0m`)

    try {
      if (wsRef.current && wsRef.current.readyState < WebSocket.CLOSING) wsRef.current.close()
    } catch {
      /* ignore */
    }
    wsRef.current = null

    const token = await getToken()
    if (!aliveRef.current) return // 弹窗已关闭，不再建连
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
    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      setConnState('open')
      ws.send(JSON.stringify({ type: 'resize', cols, rows }))
    }
    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') term?.write(ev.data)
      else {
        try {
          term?.write(new Uint8Array(ev.data as ArrayBuffer))
        } catch {
          /* ignore */
        }
      }
    }
    ws.onerror = () => {
      setConnState('error')
      setError('连接出错：目标主机不可达或 SSH 服务拒绝连接，请检查主机 / 端口 / 凭据')
      term?.writeln('\x1b[31m[终端] 连接出错\x1b[0m')
      try {
        ws.close()
      } catch {
        /* ignore */
      }
    }
    ws.onclose = () => {
      // onerror 先于 onclose 触发：错误态不应被覆盖成"已断开"
      setConnState((prev) => (prev === 'error' ? prev : 'closed'))
      term?.writeln('\r\n\x1b[90m[连接已关闭]\x1b[0m\r\n')
      if (wsRef.current === ws) wsRef.current = null
    }
  }

  function cleanup() {
    try {
      if (wsRef.current && wsRef.current.readyState < WebSocket.CLOSING) wsRef.current.close()
    } catch {
      /* ignore */
    }
    wsRef.current = null
    try {
      termRef.current?.dispose()
    } catch {
      /* ignore */
    }
    termRef.current = null
    fitRef.current = null
    roRef.current?.disconnect()
    roRef.current = null
    if (containerRef.current) {
      // 清空容器，避免 Dialog 复用残留 DOM
      containerRef.current.innerHTML = ''
    }
    setConnState('idle')
  }

  function disconnect() {
    try {
      wsRef.current?.close()
    } catch {
      /* ignore */
    }
    wsRef.current = null
    setConnState('closed')
  }

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

  const stateColor =
    connState === 'open'
      ? theme.palette.success.main
      : connState === 'connecting'
        ? theme.palette.warning.main
        : connState === 'error' || connState === 'closed'
          ? theme.palette.error.main
          : theme.palette.text.secondary

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{ sx: { height: '72vh' } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <IconTerminal sx={{ color: theme.palette.primary.main }} />
        <Typography variant="h6" sx={{ fontWeight: 700, flexGrow: 1, minWidth: 0 }} noWrap>
          SSH 终端 · {name || host || '未指定主机'}
        </Typography>
        <Chip
          size="small"
          label={STATE_LABEL[connState]}
          sx={{ bgcolor: stateColor + '22', color: stateColor, border: `1px solid ${stateColor}` }}
        />
        <IconButton
          size="small"
          title="在新页签打开完整终端"
          onClick={() => {
            const q = new URLSearchParams({ host, port: String(port ?? 22), name: name || host })
            if (credentialId) q.set('credentialId', credentialId)
            navigate(`/terminal?${q.toString()}`)
          }}
        >
          <IconOpenInNew fontSize="small" />
        </IconButton>
        <IconButton size="small" onClick={onClose} title="关闭">
          <IconClose fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', p: 1 }}>
        {error && (
          <Box sx={{ px: 1.5, pt: 0.5 }}>
            <Chip
              size="small"
              color="error"
              variant="outlined"
              sx={{ width: '100%', justifyContent: 'flex-start', height: 'auto', py: 0.5, fontSize: 12 }}
              label={error}
            />
          </Box>
        )}
        <Box
          ref={containerRef}
          sx={{
            flex: 1,
            minHeight: 0,
            p: 1,
            bgcolor: '#0B0E14',
            borderRadius: 1,
            border: `1px solid ${theme.palette.divider}`,
          }}
        />
      </DialogContent>
      <DialogActions sx={{ p: 1, justifyContent: 'space-between' }}>
        <Typography variant="caption" color="text.secondary" sx={{ pl: 1 }}>
          {connState === 'open' ? '已连接，直接键入命令（支持 vim / top 等全屏程序）' : '页内终端 · 关闭后自动断开连接'}
        </Typography>
        <Stack direction="row" spacing={1}>
          {connState === 'open' ? (
            <>
              <Button size="small" variant="outlined" startIcon={<IconExit />} onClick={sendExit}>
                退出会话
              </Button>
              <Button size="small" color="error" startIcon={<IconDisconnect />} onClick={disconnect}>
                断开
              </Button>
            </>
          ) : host ? (
            <Button size="small" variant="contained" startIcon={<IconConnect />} onClick={() => connect(host, port, credentialId, name)}>
              重连
            </Button>
          ) : null}
        </Stack>
      </DialogActions>
    </Dialog>
  )
}
