import express from 'express'
import cors from 'cors'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DEFAULT_PORT } from '@shared/constants'
import { requireWriteToken, getToken } from './auth'
import { assetsRouter } from './routes/assets'
import { diagnosticsRouter } from './routes/diagnostics'
import { dashboardRouter } from './routes/dashboard'
import { knowledgeRouter } from './routes/knowledge'
import { relationsRouter } from './routes/relations'
import { patrolsRouter } from './routes/patrols'
import { alertsRouter } from './routes/alerts'
import { automationRouter } from './routes/automation'
import { clustersRouter } from './routes/clusters'
import { guardrailsRouter } from './routes/guardrails'
import { doloresRouter } from './routes/dolores'
import { ok, notFoundHandler, errorHandler } from './utils/response'
import { monitorService } from './services/monitorService'
import { sshRouter } from './routes/ssh'
import { dbRouter } from './routes/db'
import { cloudRouter } from './routes/cloud'
import { credentialsRouter } from './routes/credentials'
import { alertRulesRouter } from './routes/alert-rules'
import { notificationChannelsRouter } from './routes/notificationChannels'
import { metricsRouter } from './routes/metrics'
import { WebSocketServer } from 'ws'
import { attachTerminal } from './services/terminalService'
import { alertRuleService } from './services/alertRuleService'
import { metricCollector } from './services/metricCollector'
import { metricSeriesStore } from './store/metricSeriesStore'
import { healthStore } from './store/healthHistoryStore'
import { authRouter } from './routes/auth'
import { usersRouter } from './routes/users'
import { monitorRouter } from './routes/monitor'
import { auditRouter } from './routes/audit'
import { currentUser } from './services/authService'
import { memoryStore } from './store/memoryStore'
import { logger } from './utils/logger'

// 是否在 Electron 打包态：只用 process 字段判断，避免顶层 import electron
// 纯 Node / tsx 跑 server 时 electron 包没有可用的 named export
function isElectronPackaged(): boolean {
  const p = process as NodeJS.Process & { resourcesPath?: string }
  return Boolean(process.versions.electron) && Boolean(p.resourcesPath)
}

/**
 * 构造 Express 能力总线（不立即监听）。
 * 返回 http.Server 实例，便于 Electron 主进程先注册 'error' 事件再调用 listen()，
 * 否则 EADDRINUSE 会在事件监听 attach 前抛出，被 uncaughtException 捕获导致崩溃弹窗。
 * host 默认 '127.0.0.1'，与主进程 loadURL('http://127.0.0.1:<port>') 严格对应，
 * 避免 Windows 下 localhost 解析到 IPv6 ::1 导致 Chromium ERR_FAILED。
 */
export function createServer(): http.Server {
  const app = express()

  // CORS：仅允许同源（无 origin）/ 本地回环 / file:// / ops:// 来源，拒绝外部网页跨域访问。
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true) // 同源 / 无 origin（如 ops:// 自定义协议）
        if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true)
        if (origin === 'file://' || origin.startsWith('ops://')) return cb(null, true)
        return cb(null, false)
      },
      credentials: true,
    })
  )
  // 变更型请求（POST/PUT/PATCH/DELETE）需携带应用令牌，阻断同机恶意网页/进程越权操作。
  app.use(requireWriteToken)
  app.use(express.json())

  // 健康检查
  app.get('/api/health', (_req, res) => ok(res, { ok: true }))

  // 运行指标（供监控/巡检使用）
  app.get('/api/metrics', (_req, res) =>
    ok(res, {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      platform: process.platform,
      node: process.version,
    })
  )

  // 模块路由
  app.use('/api/assets', assetsRouter)
  app.use('/api/diagnostics', diagnosticsRouter)
  app.use('/api/dashboard', dashboardRouter)
  app.use('/api/knowledge', knowledgeRouter)
  app.use('/api/relations', relationsRouter)
  app.use('/api/patrols', patrolsRouter)
  app.use('/api/alerts', alertsRouter)
  app.use('/api/automation', automationRouter)
  app.use('/api/clusters', clustersRouter)
  app.use('/api/guardrails', guardrailsRouter)
  app.use('/api/dolores', doloresRouter)
  app.use('/api/ssh', sshRouter)
  app.use('/api/db', dbRouter)
  app.use('/api/cloud', cloudRouter)
  app.use('/api/credentials', credentialsRouter)
  app.use('/api/alert-rules', alertRulesRouter)
  app.use('/api/notification-channels', notificationChannelsRouter)
  app.use('/api/metrics', metricsRouter)
  app.use('/api/monitor', monitorRouter)
  app.use('/api/auth', authRouter)
  app.use('/api/users', usersRouter)
  app.use('/api/audit', auditRouter)

  // 生产环境（Electron 打包后）：同源托管前端静态资源（dist）+ SPA fallback。
  // 打包后 dist 经 extraResources 解包到 resources/app-dist（真实目录，非 asar 内），
  // 规避 asar 内 express.static 的 fs.realpath 失败；开发/未打包则用源码同级 dist。
  if (process.env.NODE_ENV === 'production') {
    const electronProcess = process as NodeJS.Process & { resourcesPath?: string }
    // 打包态：resources/app-dist（extraResources 解包）；非打包态：项目根 dist/
    // 注意：本文件位于 src/server/，需两级 .. 才能回到项目根，再拼 dist。
    const dist = isElectronPackaged()
      ? path.join(electronProcess.resourcesPath || '', 'app-dist')
      : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist')
    app.use(express.static(dist))
    // SPA fallback：仅对非 /api 前端路由回退 index.html；
    // /api/* 未知路径交给 notFoundHandler 返回 JSON 404 信封，避免前端误判成功。
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next()
      res.sendFile(path.join(dist, 'index.html'))
    })
  }

  app.use(notFoundHandler)
  app.use(errorHandler)

  const server = http.createServer(app)

  // 终端 WebSocket（SSH shell 桥接）：浏览器经 ws:// 连到本机，服务端透传到目标主机。
  // verifyClient 要求：① 应用令牌（x-ops-token，query.token）② 用户会话令牌（x-ops-user-token，query.ut）。
  // 双层校验阻断"同机任意进程/未登录会话"借 credentialId 直接开 SSH 终端。
  // 开发态（NODE_ENV !== 'production'）应用令牌放宽（浏览器预览无 IPC），用户会话仍强制。
  const wss = new WebSocketServer({
    server,
    path: '/api/terminal',
    verifyClient: (info, cb) => {
      try {
        const url = new URL(info.req.url || '', 'http://localhost')
        const appTokenOk =
          process.env.NODE_ENV !== 'production' || url.searchParams.get('token') === getToken()
        const userToken = url.searchParams.get('ut') || ''
        const userOk = Boolean(currentUser(userToken))
        cb(appTokenOk && userOk)
      } catch {
        cb(false)
      }
    },
  })
  attachTerminal(wss)

  // 把 wss 挂到 server 上，便于主进程统一关闭
  ;(server as http.Server & { wss?: WebSocketServer }).wss = wss

  return server
}

let backgroundTimers: ReturnType<typeof setInterval>[] = []

// 启动后台任务：主机存活监控 + 告警规则引擎。应在 server 成功 listen 后调用，
// 避免端口冲突重试时重复启动多套定时任务。
export function startBackgroundJobs(): void {
  stopBackgroundJobs()

  // 加载历史时序并启动周期指标采集（有 SSH 凭据的资产每 60s 采集一次）
  metricSeriesStore.loadSeries()
  healthStore.loadHealthSeries()
  const collectorTimer = metricCollector.start()
  backgroundTimers.push(collectorTimer)

  // 启动主机存活监控（TCP/ICMP 定时探测，驱动资产「在线/离线」与延迟展示）
  const monitorTimer = monitorService.start()
  backgroundTimers.push(monitorTimer)

  // 告警规则引擎：与存活监控并行，定时评估各启用规则，命中即生成告警
  const alertTimer = setInterval(() => {
    try {
      alertRuleService.evaluateAll()
    } catch {
      /* 规则评估失败不应中断能力总线 */
    }
  }, 30000)
  backgroundTimers.push(alertTimer)
}

// 停止所有后台定时任务
export function stopBackgroundJobs(): void {
  metricCollector.stop()
  metricSeriesStore.flushSeries()
  healthStore.flushHealth()
  monitorService.stop()
  backgroundTimers.forEach(clearInterval)
  backgroundTimers = []
  // 主存储立即落盘（防抖窗口内的变更不因退出丢失）
  try {
    memoryStore.flush()
  } catch {
    /* ignore */
  }
}

// 直接以 `tsx src/server/index.ts` 运行时启动监听（Electron 主进程 import 本模块不会触发，由 createServer 显式调用）
const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain && !process.versions.electron) {
  const port = Number(process.env.PORT) || DEFAULT_PORT
  const server = createServer()
  server.listen(port, '127.0.0.1', () => {
    logger.info(`Express 能力总线已启动: http://127.0.0.1:${port}`)
    // eslint-disable-next-line no-console
    console.log(`[ops-platform] Express 能力总线已启动: http://127.0.0.1:${port}`)
  })
  startBackgroundJobs()
}
