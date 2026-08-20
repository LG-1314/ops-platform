import type { WebSocketServer, WebSocket } from 'ws'
import { URL } from 'node:url'
import { Client } from 'ssh2'
import { connectSsh } from './sshService'
import { credentialService } from './credentialService'
import { currentUser } from './authService'
import { auditService } from './auditService'
import { logger } from '../utils/logger'

// SSH 终端桥接：浏览器经 WebSocket 连到本机能力总线，服务端用 ssh2 建立到目标主机的
// shell 会话，双向透传输入/输出。无凭据或连接失败时给出可读错误并关闭，绝不崩溃。
export function attachTerminal(wss: WebSocketServer): void {
  wss.on('connection', (ws: WebSocket, req: { url?: string }) => {
    const url = new URL(req.url || '', 'http://localhost')
    const q = url.searchParams
    const host = q.get('host') || ''
    const port = q.get('port') ? Number(q.get('port')) : undefined
    const credentialId = q.get('credentialId') || undefined
    const cols = q.get('cols') ? Number(q.get('cols')) : 80
    const rows = q.get('rows') ? Number(q.get('rows')) : 24
    // 用户会话（verifyClient 已校验非空，这里仅取用户名用于审计）
    const user = currentUser(q.get('ut') || '')
    const username = user?.username || 'unknown'

    let client: Client | null = null
    let shell: { end: () => void; write: (d: string) => void; setWindow?: (r: number, c: number, w: number, h: number) => void; on: (e: string, cb: (d: Buffer) => void) => void; stderr: { on: (e: string, cb: (d: Buffer) => void) => void } } | null = null

    const cleanup = (): void => {
      try {
        shell?.end()
      } catch {
        /* ignore */
      }
      try {
        client?.end()
      } catch {
        /* ignore */
      }
    }

    void (async () => {
      try {
        if (!host) throw new Error('缺少主机参数')
        const params: {
          host: string
          port?: number
          username?: string
          password?: string
          privateKey?: string
        } = { host, port }
        if (credentialId) {
          const secret = credentialService.decrypt(credentialId)
          if (!secret) throw new Error('凭据不存在或已被删除')
          params.username = secret.username
          params.password = secret.password
          params.privateKey = secret.privateKey
        }
        auditService.record('terminal.connect', username, `host=${host}:${port || 22} credential=${credentialId || '(none)'}`)
        client = await connectSsh(params)
        client.shell(
          { cols, rows, term: 'xterm-256color' },
          (err: Error | undefined, stream: NonNullable<typeof shell>) => {
            if (err) {
              try {
                ws.send(`\r\n[终端] 连接失败: ${err.message}\r\n`)
              } catch {
                /* ignore */
              }
              cleanup()
              return
            }
            shell = stream
            stream.on('data', (d: Buffer) => {
              if (ws.readyState === ws.OPEN) ws.send(d.toString('utf8'))
            })
            stream.stderr.on('data', (d: Buffer) => {
              if (ws.readyState === ws.OPEN) ws.send(d.toString('utf8'))
            })
            stream.on('close', () => {
              try {
                ws.close()
              } catch {
                /* ignore */
              }
            })
            ws.on('message', (msg: Buffer) => {
              const text = msg.toString()
              try {
                const parsed = JSON.parse(text)
                if (parsed.type === 'resize' && stream.setWindow) {
                  stream.setWindow(parsed.rows, parsed.cols, 0, 0)
                  return
                }
                if (typeof parsed.data === 'string') {
                  stream.write(parsed.data)
                  return
                }
              } catch {
                /* 纯文本直接写入 */
              }
              stream.write(text)
            })
            ws.on('close', () => cleanup())
          }
        )
      } catch (e) {
        const msg = (e as Error).message
        logger.error(`terminal.connect failed user=${username} host=${host}:${port || 22} err=${msg}`)
        try {
          ws.send(`\r\n[终端] 连接失败: ${msg}\r\n`)
        } catch {
          /* ignore */
        }
        try {
          ws.close()
        } catch {
          /* ignore */
        }
      }
    })()
  })
}
