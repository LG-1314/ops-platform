import crypto from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'

// 应用级共享令牌：能力总线（Express）与 Electron 主进程转发同处一个 Node 进程，
// 通过本单例模块共享同一份令牌。渲染进程经 IPC 取回后，随写请求 / 终端 WS 携带。
// 作用：本地 127.0.0.1 仍可能被同机恶意网页/进程探测，令牌把"变更型操作 + 终端桥接"
// 限制在持有令牌的本应用之内（读接口保持本地只读开放，风险低）。
let token: string | null = null

/** 取当前进程令牌（首次调用时生成，进程内恒定）。 */
export function getToken(): string {
  if (!token) token = crypto.randomBytes(24).toString('hex')
  return token
}

/** 常数时间令牌比较：长度打平后逐字节异或，避免逐字符串比较的时序侧信道。 */
export function safeTokenEqual(a: string | undefined | null, b: string): boolean {
  if (!a) return false
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) {
    // 长度不同仍做一次比较，抹平"长度直接失败"的时序差异
    crypto.timingSafeEqual(bb, bb)
    return false
  }
  return crypto.timingSafeEqual(ab, bb)
}

/** 携带令牌的请求头，供主进程 Node http 转发时附加。 */
export const TOKEN_HEADER = 'x-ops-token'

export function authHeaders(): Record<string, string> {
  return { [TOKEN_HEADER]: getToken() }
}

/**
 * 校验令牌：只认请求头。终端 WebSocket 无法自定义握手头，由 index.ts 的
 * verifyClient 直接用 query 参数 + safeTokenEqual 校验；HTTP 请求一律不再接受
 * query 传令牌（URL 会进入各类日志/崩溃转储，属泄露面）。
 */
export function checkToken(req: {
  headers: Record<string, string | string[] | undefined>
  query?: Record<string, string | undefined>
}): boolean {
  const headerVal = req.headers[TOKEN_HEADER]
  const fromHeader = Array.isArray(headerVal) ? headerVal[0] : headerVal
  return safeTokenEqual(fromHeader, getToken())
}

/**
 * Express 中间件：仅对变更型方法（POST/PUT/PATCH/DELETE）要求令牌；
 * 只读 GET/HEAD/OPTIONS 放开（本地只读低风险）。缺失/错误令牌返回 401 信封。
 * 开发态（NODE_ENV !== 'production'）放宽令牌校验：浏览器预览无法经 IPC 取应用令牌，
 * 且开发态仅本地回环低风险；生产态（Electron 打包）严格强制，阻断同机恶意进程越权。
 * 例外：/api/auth/login 是会话入口（签发用户令牌），须豁免应用令牌——
 * 否则"先有应用令牌才能登录"形成死锁；登录本身已有失败限流兜底。
 */
const LOGIN_PATH = '/api/auth/login'

export function requireWriteToken(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next()
  if (req.path === LOGIN_PATH) return next()
  if (process.env.NODE_ENV === 'production') {
    if (checkToken({ headers: req.headers })) return next()
    res.status(401).json({ code: 401, message: '未授权：请通过桌面应用访问（缺少应用令牌）', data: null })
    return
  }
  next()
}
