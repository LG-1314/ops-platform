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
    const requestedCols = q.get('cols') ? Number(q.get('cols')) : 80
    const requestedRows = q.get('rows') ? Number(q.get('rows')) : 24
    const cols = Number.isInteger(requestedCols) ? Math.max(1, Math.min(500, requestedCols)) : 80
    const rows = Number.isInteger(requestedRows) ? Math.max(1, Math.min(500, requestedRows)) : 24
    // 用户会话（verifyClient 已校验非空，这里仅取用户名用于审计）
    const user = currentUser(q.get('ut') || '')
    const username = user?.username || 'unknown'

    let client: Client | null = null
    let shell: { end: () => void; write: (d: string) => void; setWindow?: (r: number, c: number, w: number, h: number) => void; on: (e: string, cb: (d: Buffer) => void) => void; stderr: { on: (e: string, cb: (d: Buffer) => void) => void } } | null = null
    // 防重复清理（两端任意一方 close 都可能触发）
    let cleaned = false
    const cleanup = (): void => {
      if (cleaned) return
      cleaned = true
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
      try {
        if (ws.readyState === ws.OPEN) ws.close()
      } catch {
        /* ignore */
      }
    }

    // 立即注册 WS 关闭监听：浏览器在 connectSsh 完成前断开时，
    // 此后创建的 shell 必须能感知并结束，否则空闲 SSH 会话泄漏到进程退出。
    ws.on('close', () => cleanup())
    ws.on('error', () => cleanup())

    void (async () => {
      try {
        if (!host) throw new Error('缺少主机参数')
        if (cleaned) return // 连接期间浏览器已断开，放弃建立 shell
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
        if (cleaned) {
          // connectSsh 等待期间浏览器断开：立刻释放 SSH 连接
          cleanup()
          return
        }
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
            // 背压上限：慢客户端（窗口隐藏/网络差）+ 快速输出（如 cat 大文件）
            // 会把 ws 发送缓冲撑到内存失控；超过 4MB 暂停读，回落后再恢复。
            const WS_BACKPRESSURE_BYTES = 4 * 1024 * 1024
            stream.on('data', (d: Buffer) => {
              if (ws.readyState !== ws.OPEN) return
              if (ws.bufferedAmount > WS_BACKPRESSURE_BYTES) {
                const pausable = stream as unknown as { pause: () => void, resume: () => void }
                pausable.pause()
                const resume = (): void => {
                  pausable.resume()
                  ws.removeListener('drain', resume)
                }
                ws.once('drain', resume)
                return
              }
              // 二进制帧透传：避免 d.toString('utf8') 在多字节字符被分块时产生截断乱码
              ws.send(d)
            })
            stream.stderr.on('data', (d: Buffer) => {
              if (ws.readyState === ws.OPEN) ws.send(d)
            })
            stream.on('close', () => {
              cleanup()
            })
            ws.on('message', (msg: Buffer) => {
              const text = msg.toString()
              try {
                const parsed = JSON.parse(text)
                if (parsed.type === 'resize' && stream.setWindow) {
                  const nextRows = Number(parsed.rows)
                  const nextCols = Number(parsed.cols)
                  if (Number.isInteger(nextRows) && Number.isInteger(nextCols) && nextRows > 0 && nextRows <= 500 && nextCols > 0 && nextCols <= 500) {
                    stream.setWindow(nextRows, nextCols, 0, 0)
                  }
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
