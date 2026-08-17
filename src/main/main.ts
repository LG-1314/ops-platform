import { app, BrowserWindow, dialog, protocol, session, net, ipcMain } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import fs from 'node:fs'
import http from 'node:http'
import { createServer, startBackgroundJobs, stopBackgroundJobs } from '../server/index'

// Electron 仅作壳：启动 Express 能力总线（提供 /api 能力），
// 渲染进程经自定义协议 app:// 直接由主进程从 resources/app-dist 读取前端产物，
// 完全绕过 Chromium 访问本地 HTTP 可能失败的代理/防火墙/TUN 拦截问题。
// Express 仍作为 API 能力总线在 127.0.0.1:8787 运行，CORS 全开。
const BASE_PORT = Number(process.env.PORT) || 8787

// 开发态默认走 IPv4，避免 Vite 只绑 ::1 时 Chromium 解析 localhost 失败
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173'

// 禁用系统代理，防止 Clash/企业代理把 127.0.0.1 也劫持导致 ERR_FAILED
app.commandLine.appendSwitch('no-proxy-server')
// 部分机器 GPU/渲染子进程缺 DLL 会直接崩（exit 0xC0000135），先走软件渲染兜底
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-gpu-compositing')
// 注意：不再使用 in-process-gpu（与 disable-gpu 冲突，且可能导致渲染进程崩溃）
// 渲染进程沙箱：受限/企业 Windows 上 Chromium 渲染进程沙箱可能无法初始化，
// 导致渲染进程创建即崩、任何首屏加载（ops:// / http:// / file://）都 ERR_FAILED(-2)。
// 关闭渲染进程沙箱是这类环境的标准解法（内部运维工具可接受该取舍）。
app.commandLine.appendSwitch('no-sandbox')
app.commandLine.appendSwitch('disable-gpu-sandbox')
// 共享内存 /dev/shm 过小也会导致渲染进程崩溃，禁用之改用堆内存兜底
app.commandLine.appendSwitch('disable-dev-shm-usage')

// 把 app:// 注册为特权标准协议，使 Chromium 像对待 https/http 一样处理它：
// 支持 fetch、service worker、ES Module、same-origin 等。
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'ops',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
      corsEnabled: true,
    },
  },
])

// 最小错误页（data URL，绝不白屏）
const ERROR_PAGE_HTML =
  'data:text/html,<!doctype html><meta charset=utf-8><body style=font-family:sans-serif;padding:40px><h2>加载失败</h2><p>页面资源加载异常。请重试，或把崩溃日志内容发给我们排查。</p></body>'

function getLogDir(): string {
  try {
    return app.isReady() ? app.getPath('userData') : process.env.APPDATA || process.env.HOME || '.'
  } catch {
    return process.env.APPDATA || process.env.HOME || '.'
  }
}

function getCrashLogPath(): string {
  return path.join(getLogDir(), 'ops-platform-crash.log')
}
function getBootLogPath(): string {
  return path.join(getLogDir(), 'ops-platform-boot.log')
}

// 统一写日志（启动 + 关键步骤 + 错误）
function writeLog(file: string, message: string): void {
  try {
    const dir = getLogDir()
    fs.mkdirSync(dir, { recursive: true })
    fs.appendFileSync(path.join(dir, file), `${new Date().toISOString()} ${message}\n`)
  } catch {
    /* ignore */
  }
}

// 致命错误：落盘 + 弹原生错误框（保证"打不开"时用户能看到原因，而非静默退出）
function showFatal(tag: string, err: unknown): void {
  const detail = err instanceof Error ? err.stack || err.message : String(err)
  const line = `[${tag}] ${detail}`
  writeLog('ops-platform-crash.log', line)
  const crashPath = getCrashLogPath()
  const bootPath = getBootLogPath()
  try {
    dialog.showErrorBox(
      `运维平台启动失败 (${tag})`,
      `${detail}\n\n崩溃日志：${crashPath}\n启动日志：${bootPath}`
    )
  } catch {
    /* ignore */
  }
}

// 前端 API 经 ipc 由主进程 Node 转发 Express（端口动态注入）。
// 关键：不经过 Chromium 网络栈，彻底避开本机代理/防火墙对 127.0.0.1 的拦截
// （之前 loadURL http://127.0.0.1 与自定义协议导航都因同一拦截/realm 问题 ERR_FAILED）。
function forwardRequest(
  port: number,
  method: string,
  relPath: string,
  body?: unknown
): Promise<{ statusCode: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const data = body != null ? JSON.stringify(body) : undefined
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: `/api${relPath}`,
        method,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8')
          let parsed: unknown = raw
          try {
            parsed = JSON.parse(raw)
          } catch {
            /* 非 JSON 原样返回 */
          }
          resolve({ statusCode: res.statusCode || 200, body: parsed })
        })
      }
    )
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

ipcMain.handle('ops-api', async (_e, arg: { method: string; path: string; body?: unknown }) => {
  const port = Number(process.env.OPS_API_PORT || BASE_PORT)
  const { statusCode, body } = await forwardRequest(port, arg.method, arg.path, arg.body)
  // Express 统一返回信封 { code, data, message }；这里直接透传该信封，
  // 渲染端 bus.ts 的 request() 正是按此信封解析（res.code === 0 视为成功）。
  // /api 路由永远返回 JSON 信封（含 404 / fail），不会返回 HTML，故可安全解开 statusCode 包装。
  if (body && typeof body === 'object' && 'code' in (body as Record<string, unknown>)) {
    return body
  }
  // 兜底：非信封（异常 HTML 等）包装成信封，保留 HTTP 状态码
  return {
    code: statusCode >= 400 ? statusCode : 0,
    message: typeof body === 'string' ? body : 'ok',
    data: null,
  }
})

// 渲染进程运行时错误（经 preload 转发），独立落盘便于定位"无声黑屏"
ipcMain.on('renderer-error', (_e, info: { kind: string; msg: string }) => {
  writeLog('ops-platform-renderer.log', `[renderer-${info.kind}] ${info.msg}`)
})

process.on('uncaughtException', (e) => showFatal('uncaughtException', e))
process.on('unhandledRejection', (e) => showFatal('unhandledRejection', e))

// 进程级最早标记：只要进程能起来就写入，用于判断"是不是连进程都没启动"
writeLog(
  'ops-platform-boot.log',
  `process-started pid=${process.pid} argv=${process.argv.join(' ')}`
)

// 单实例锁：避免多开争抢端口。拿不到锁时明确提示"已在运行"，而非静默退出
if (!app.requestSingleInstanceLock()) {
  try {
    dialog.showErrorBox(
      '运维全维度管理平台',
      '程序已在运行中，请查看任务栏或系统托盘，不要重复双击启动。'
    )
  } catch {
    /* ignore */
  }
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
  })

  let win: BrowserWindow | null = null
  let showingFallback = false
  let apiServer: http.Server | null = null
  let isQuitting = false

  const MIME_TYPES: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf',
  }

  function registerAppProtocol(): void {
    const baseDir = app.isPackaged
      ? path.join(process.resourcesPath, 'app-dist')
      : path.join(__dirname, '..', 'dist')

    writeLog(
      'ops-platform-boot.log',
      `ops-protocol-registering base=${baseDir} indexExists=${fs.existsSync(path.join(baseDir, 'index.html'))}`
    )

    protocol.handle('ops', async (request) => {
      try {
        const url = new URL(request.url)
        let rel: string
        if (url.host && url.host !== 'localhost') {
          rel = '/' + url.host + (url.pathname.startsWith('/') ? url.pathname : '/' + url.pathname)
        } else {
          rel = url.pathname
        }
        if (rel === '/' || rel === '') rel = '/index.html'

        // API: ops://localhost/api/...
        if (rel === '/api' || rel.startsWith('/api/')) {
          const port = process.env.OPS_API_PORT || String(BASE_PORT)
          const method = request.method || 'GET'
          let body: Buffer | undefined
          if (method !== 'GET' && method !== 'HEAD') {
            body = Buffer.from(await request.arrayBuffer())
          }
          return await new Promise<Response>((resolve) => {
            const req = http.request(
              {
                host: '127.0.0.1',
                port: Number(port),
                path: `${rel}${url.search || ''}`,
                method,
                timeout: 60000,
                headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
              },
              (res) => {
                const chunks: Buffer[] = []
                res.on('data', (c) => chunks.push(c))
                res.on('end', () => {
                  const text = Buffer.concat(chunks).toString('utf8')
                  resolve(
                    new Response(text, {
                      status: res.statusCode || 200,
                      headers: {
                        'content-type': res.headers['content-type'] || 'application/json; charset=utf-8',
                      },
                    })
                  )
                })
              }
            )
            req.on('error', (err) => {
              resolve(
                new Response(JSON.stringify({ code: 500, message: err.message }), {
                  status: 502,
                  headers: { 'content-type': 'application/json; charset=utf-8' },
                })
              )
            })
            if (body?.length) req.write(body)
            req.end()
          })
        }

        const safePath = path
          .normalize(rel)
          .replace(/^(\.\.(\/|\\|$))+/, '')
          .replace(/^[/\\]+/, '')
        const filePath = path.join(baseDir, safePath)
        const resolvedBase = path.resolve(baseDir)
        const resolvedFile = path.resolve(filePath)
        if (
          !resolvedFile.startsWith(resolvedBase + path.sep) &&
          resolvedFile !== resolvedBase
        ) {
          return new Response('Forbidden', { status: 403 })
        }
        writeLog('ops-platform-boot.log', `[ops-protocol] ${rel} -> ${filePath}`)
        // 关键修复：用 net.fetch(file://) 返回 Blink 原生 Response。
        // 自定义协议对“主文档导航”若用主进程 new Response(Buffer/字符串)，
        // 会因 realm 不匹配在 Electron 28 稳定报 ERR_FAILED(-2)；net.fetch
        // 返回的 Response 由 Blink 创建，导航可被正确接受。且该路径完全不经过
        // Chromium 出站网络，可彻底避开本机代理/防火墙对 127.0.0.1 的拦截
        // （之前 http://127.0.0.1:8787/ 首屏也因同一拦截报 ERR_FAILED）。
        try {
          return await net.fetch(pathToFileURL(filePath).toString())
        } catch (e: any) {
          writeLog('ops-platform-crash.log', `[ops-protocol net.fetch] ${e?.stack || e}`)
          return new Response('Not found', { status: 404 })
        }
      } catch (err: any) {
        writeLog('ops-platform-crash.log', `[ops-protocol] ${err?.stack || err}`)
        if (err?.code === 'ENOENT') return new Response('Not found', { status: 404 })
        return new Response(`Internal error: ${err.message}`, { status: 500 })
      }
    })

    writeLog('ops-platform-boot.log', `ops-protocol-registered base=${baseDir}`)
  }

  function createWindow(port: number): void {
    // 把实际 API 端口注入给 preload / 协议转发
    process.env.OPS_API_PORT = String(port)

    win = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 1024,
      minHeight: 720,
      show: false,
      title: '运维全维度管理平台',
      backgroundColor: '#0B0E14',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        // 首屏用 loadFile(file://) 加载，需关闭 webSecurity 以允许 file:// 下的 ES Module 加载
        webSecurity: false,
      },
    })

    win.once('ready-to-show', () => win?.show())

    win.webContents.on('did-finish-load', () => {
      writeLog('ops-platform-boot.log', `did-finish-load url=${win?.webContents.getURL()}`)
      // 兜底检测：若首屏 DOM 未渲染（file:// 下模块脚本因 CORS 等静默失败，
      // 但 loadFile 本身成功），记录诊断，避免再次"无声白屏"
      setTimeout(() => {
        const probe = `
          (function(){
            const root = document.getElementById('root');
            const body = document.body;
            const styles = document.querySelectorAll('style');
            const emotion = document.querySelectorAll('[data-emotion]');
            const mui = document.querySelectorAll('[class*="Mui"], [class*="muirtl"]');
            const firstH1 = document.querySelector('h1');
            return {
              url: location.href,
              rootChildren: root ? root.childElementCount : -1,
              rootLen: root ? root.innerHTML.length : 0,
              bodyLen: body ? body.innerHTML.length : 0,
              styleTags: styles.length,
              emotionNodes: emotion.length,
              muiNodes: mui.length,
              firstH1: firstH1 ? firstH1.textContent : null,
              bodyBg: body ? getComputedStyle(body).backgroundColor : null,
              rootBg: root ? getComputedStyle(root).backgroundColor : null,
              scripts: document.scripts.length,
              errors: window.__opsRendererErrors || []
            };
          })()
        `;
        win?.webContents
          .executeJavaScript(probe)
          .then((info: any) => {
            writeLog('ops-platform-boot.log', `[dom-probe] ${JSON.stringify(info)}`)
          })
          .catch((e) => {
            writeLog('ops-platform-crash.log', `[dom-probe-error] ${e instanceof Error ? e.message : String(e)}`)
          })
      }, 2500)
    })

    // 捕获渲染进程所有 console 输出（React 报错、组件异常等），写入独立日志
    const CONSOLE_LEVELS = ['debug', 'log', 'warn', 'error']
    win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
      const lvl = CONSOLE_LEVELS[level] || String(level)
      writeLog('ops-platform-renderer.log', `[console-${lvl}] ${sourceId}:${line} ${message}`)
    })

    // 渲染进程崩溃的真实原因日志：下次若仍失败，日志会写明是 crashed / launch-failed / oom
    win.webContents.on('crashed', (_e, killed) => {
      if (showingFallback) return
      showingFallback = true
      showFatal(
        'renderer-crashed',
        new Error(
          `渲染进程崩溃 killed=${killed}。` +
            `常见根因：① 本机缺 Visual C++ 2015-2022 x64 运行库（渲染子进程缺 DLL 直接崩）；` +
            `② Chromium 渲染进程沙箱无法初始化（已加 --no-sandbox 仍失败则属此类）。` +
            `→ 请改用安装版 setup.exe（自动部署 VC++），或到微软官网安装 VC++ 可再发行组件包(x64)。`
        )
      )
    })

    win.webContents.on('did-fail-load', (_e, code, desc) => {
      if (showingFallback) return
      showingFallback = true
      showFatal('did-fail-load', new Error(`code=${code} desc=${desc}`))
      win
        ?.loadURL(ERROR_PAGE_HTML)
        .catch((err) => showFatal('错误页加载失败', err))
    })

    // 走 ops:// 特权自定义协议（首屏 + 子资源均由主进程 net.fetch(file://) 提供）：
    // 该路径完全不经过 Chromium 出站网络，可彻底避开本机代理/防火墙对 127.0.0.1 的
    // 拦截（之前 http://127.0.0.1:8787/ 首屏即因同一拦截稳定 ERR_FAILED(-2)）。
    // 自定义协议对"主文档导航"必须用 net.fetch 返回 Blink 原生 Response，
    // 主进程 new Response() 会因 realm 不匹配同样报 ERR_FAILED，故 handler 内已改用 net.fetch。
    // 首屏从磁盘加载（loadFile），完全不经过 Chromium 网络栈：
    // 规避了（1）自定义协议对“主文档导航”在 Electron 28 的 ERR_FAILED 限制；
    // （2）本机代理/防火墙对 127.0.0.1 回环的拦截。webSecurity:false 已在
    // webPreferences 中开启，以允许 file:// 下的 ES Module 加载。
    const baseDir = app.isPackaged
      ? path.join(process.resourcesPath, 'app-dist')
      : path.join(__dirname, '..', 'dist')
    const filePath = path.join(baseDir, 'index.html')
    writeLog('ops-platform-boot.log', `loadFile-start file=${filePath}`)
    win
      ?.loadFile(filePath)
      .then(() => writeLog('ops-platform-boot.log', `loadFile-ok file=${filePath}`))
      .catch((e) => {
        writeLog(
          'ops-platform-crash.log',
          `[loadFile 失败] file=${filePath} err=${e instanceof Error ? e.stack || e.message : String(e)}`
        )
        showFatal(
          'loadFile 失败',
          new Error(
            `${e instanceof Error ? e.message : String(e)}。` +
              `若反复失败，多半是渲染进程未能启动：请改用安装版 setup.exe（自动安装 VC++ 运行库），` +
              `或到微软官网下载安装「Visual C++ 2015-2022 可再发行组件包 (x64)」。`
          )
        )
      })
  }

  // 在真正加载窗口之前，探测 /api/health，确保能力总线已可服务。
  // 注意：首屏不依赖 HTTP，此探测仅用于确认 API 可用；超时也不阻塞窗口显示。
  function waitForServer(port: number, retries = 30, interval = 200): Promise<void> {
    const url = `http://127.0.0.1:${port}/api/health`
    return new Promise((resolve, reject) => {
      let attempts = 0
      const tryOnce = () => {
        attempts += 1
        const req = http.get(url, { timeout: 1000 }, (res) => {
          if (res.statusCode === 200) {
            resolve()
          } else {
            scheduleNext()
          }
        })
        req.on('error', scheduleNext)
        req.on('timeout', () => {
          req.destroy()
          scheduleNext()
        })
      }
      const scheduleNext = () => {
        if (attempts >= retries) {
          reject(new Error(`等待能力总线就绪超时（端口 ${port}，已尝试 ${retries} 次）`))
          return
        }
        setTimeout(tryOnce, interval)
      }
      tryOnce()
    })
  }

  // 尝试启动 server；端口冲突时自动在 BASE_PORT 基础上递增 10 次。
  // 关键：先 createServer（构造 app + 附加 WebSocket），再 attach 'error' 监听，最后 listen()，
  // 这样 EADDRINUSE 会被 Promise reject 捕获，不会逃到 uncaughtException 弹窗。
  async function tryStartServer(): Promise<{ server: http.Server; port: number }> {
    for (let offset = 0; offset < 10; offset += 1) {
      const port = BASE_PORT + offset
      const server = createServer()
      try {
        writeLog('ops-platform-boot.log', `server-listen-attempt port=${port}`)
        await new Promise<void>((resolve, reject) => {
          server.once('listening', () => {
            writeLog('ops-platform-boot.log', `server-listening port=${port}`)
            resolve()
          })
          server.once('error', (err) => {
            writeLog('ops-platform-crash.log', `[server-error] port=${port} code=${(err as NodeJS.ErrnoException).code} msg=${err.message}`)
            reject(err)
          })
          server.listen(port, '127.0.0.1')
        })
        apiServer = server
        startBackgroundJobs()
        return { server, port }
      } catch (err) {
        const code = (err as NodeJS.ErrnoException)?.code
        if (code === 'EADDRINUSE' && offset < 9) {
          writeLog('ops-platform-boot.log', `port-inuse-retry port=${port} next=${port + 1}`)
          continue
        }
        throw err
      }
    }
    throw new Error('所有候选端口均被占用')
  }

  function gracefulShutdown(): Promise<void> {
    return new Promise((resolve) => {
      if (!apiServer) {
        resolve()
        return
      }

      // 停止后台定时任务（监控扫描、告警规则引擎）
      try {
        stopBackgroundJobs()
      } catch {
        /* ignore */
      }

      // 关闭 WebSocketServer，避免连接保持事件循环
      const wss = (apiServer as http.Server & { wss?: import('ws').WebSocketServer }).wss
      if (wss) {
        try {
          wss.clients.forEach((ws) => {
            try {
              ws.terminate()
            } catch {
              /* ignore */
            }
          })
          wss.close()
        } catch {
          /* ignore */
        }
      }

      // 关闭 HTTP server
      try {
        apiServer.close(() => resolve())
      } catch {
        resolve()
      }

      // 兜底：3 秒后强制 resolve
      setTimeout(resolve, 3000)
    })
  }

  async function boot(): Promise<void> {
    // 会话级强制直连，配合 no-proxy-server，避免本机代理劫持本地地址
    try {
      await session.defaultSession.setProxy({ mode: 'direct' })
      writeLog('ops-platform-boot.log', 'proxy-set-to-direct')
    } catch (e) {
      writeLog('ops-platform-boot.log', `proxy-set-warn ${e instanceof Error ? e.message : String(e)}`)
    }

    // 打包后必须以 production 运行，Express 才会托管 dist 静态资源（否则窗口空白）
    process.env.NODE_ENV = process.env.NODE_ENV || 'production'
    writeLog('ops-platform-boot.log', `boot-start NODE_ENV=${process.env.NODE_ENV}`)

    // 持久化数据目录指向用户数据区（凭据密钥、store.json 落盘此处）
    try {
      process.env.OPS_DATA_DIR = app.getPath('userData')
    } catch {
      /* ignore */
    }

    // 注册 app:// 协议，必须在创建 BrowserWindow 之前完成
    registerAppProtocol()

    if (process.env.NO_WINDOW) {
      // 仅用于无界面环境验证服务启动
      try {
        await tryStartServer()
      } catch (e) {
        showFatal('startServer 失败', e)
      }
      return
    }

    let actualPort = BASE_PORT
    try {
      const { port } = await tryStartServer()
      actualPort = port
      writeLog('ops-platform-boot.log', `waitForServer-start port=${port}`)
      await waitForServer(port).catch((e) => {
        // API 探测失败不阻塞首屏显示（首屏走 app://），只记日志
        writeLog('ops-platform-boot.log', `waitForServer-warn port=${port} msg=${e instanceof Error ? e.message : String(e)}`)
      })
      writeLog('ops-platform-boot.log', `waitForServer-done port=${port}`)
      createWindow(port)
    } catch (e) {
      showFatal('能力总线启动失败', e)
      // 即使失败也把窗口打开，前端会显示错误页而不是完全无反应
      createWindow(actualPort)
    }
  }

  app.whenReady().then(boot)

  app.on('before-quit', async (e) => {
    if (isQuitting) return
    isQuitting = true
    e.preventDefault()
    writeLog('ops-platform-boot.log', 'before-quit: graceful shutdown started')
    await gracefulShutdown()
    writeLog('ops-platform-boot.log', 'before-quit: graceful shutdown done')
    app.quit()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      // 触发 before-quit 走统一清理流程
      app.quit()
    }
  })

  // 渲染进程消失（崩溃/被杀/启动失败/OOM）的统一捕获，落盘真实 reason
  app.on('render-process-gone', (_e, _wc, details) => {
    writeLog(
      'ops-platform-crash.log',
      `[render-process-gone] reason=${details.reason} exitCode=${details.exitCode}`
    )
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) boot()
  })
}
