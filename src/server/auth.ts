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

/** 携带令牌的请求头，供主进程 Node http 转发时附加。 */
export const TOKEN_HEADER = 'x-ops-token'

export function authHeaders(): Record<string, string> {
  return { [TOKEN_HEADER]: getToken() }
}

/** 支持从请求头或查询参数（终端 WS 走 query）校验令牌。 */
export function checkToken(req: {
  headers: Record<string, string | string[] | undefined>
  query?: Record<string, string | undefined>
}): boolean {
  const headerVal = req.headers[TOKEN_HEADER]
  const fromHeader = Array.isArray(headerVal) ? headerVal[0] : headerVal
  const fromQuery = req.query?.token
  return fromHeader === getToken() || fromQuery === getToken()
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
    if (checkToken({ headers: req.headers, query: req.query as Record<string, string | undefined> })) return next()
    res.status(401).json({ code: 401, message: '未授权：请通过桌面应用访问（缺少应用令牌）', data: null })
    return
  }
  next()
}
