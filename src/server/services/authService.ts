import crypto from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import { memoryStore } from '../store/memoryStore'
import type { UserAccount, SafeUser } from '@shared/types'

// RBAC 多用户认证：本地单机多账号体系。
// - 密码 scrypt 哈希（盐内嵌，格式 salt:hash），绝不明文落盘
// - 登录后签发进程内会话 token（Map 存内存，重启失效需重登）
// - 会话经 IPC 由渲染进程 localStorage 持有，随写请求携带 x-ops-user-token

export const USER_TOKEN_HEADER = 'x-ops-user-token'

// 会话：token -> { userId, createdAt, expiresAt }。滑动续期 + 绝对上限：
// 长期活跃的会话也不能无限续命（丢失设备场景下最多 7 天必须重登）。
interface Session {
  userId: string
  createdAt: number
  expiresAt: number
}
const sessions = new Map<string, Session>()
const SESSION_TTL_MS = 24 * 3600 * 1000
const SESSION_MAX_MS = 7 * 24 * 3600 * 1000
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000

function cleanupExpiredSessions(): void {
  const now = Date.now()
  for (const [token, s] of sessions) {
    if (s.expiresAt <= now || now - s.createdAt > SESSION_MAX_MS) sessions.delete(token)
  }
}
setInterval(cleanupExpiredSessions, CLEANUP_INTERVAL_MS).unref?.()

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

/** 密码哈希：scrypt 随机盐，返回 salt:hash 十六进制。 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(':')
    if (!salt || !hash) return false
    const calc = crypto.scryptSync(password, salt, 64).toString('hex')
    return crypto.timingSafeEqual(Buffer.from(calc, 'hex'), Buffer.from(hash, 'hex'))
  } catch {
    return false
  }
}

/** 脱敏用户对象（永不含 passwordHash）。 */
export function safeUser(u: UserAccount): SafeUser {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
    mustChangePassword: u.mustChangePassword,
  }
}

export function getSafeUsers(): SafeUser[] {
  return memoryStore.getUsers().map(safeUser)
}

/** 登录：校验用户名+密码，成功签发会话 token。 */
export function login(username: string, password: string): { token: string; user: SafeUser } | null {
  const u = memoryStore.getUsers().find((x) => x.username === username)
  if (!u || !verifyPassword(password, u.passwordHash)) return null
  const now = new Date().toISOString()
  memoryStore.updateUser(u.id, { lastLoginAt: now })
  const token = crypto.randomBytes(24).toString('hex')
  sessions.set(token, { userId: u.id, createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS })
  return { token, user: safeUser(u) }
}

/** 按 token 取当前用户（滑动续期：每次访问刷新 TTL；超过绝对上限强制重登）。 */
export function currentUser(token: string): SafeUser | null {
  const s = sessions.get(token)
  if (!s) return null
  const now = Date.now()
  if (s.expiresAt <= now || now - s.createdAt > SESSION_MAX_MS) {
    sessions.delete(token)
    return null
  }
  s.expiresAt = now + SESSION_TTL_MS // 滑动续期
  const u = memoryStore.getUsers().find((x) => x.id === s.userId)
  return u ? safeUser(u) : null
}

export function logout(token: string): void {
  sessions.delete(token)
}

/** Express 中间件：校验 x-ops-user-token，注入 req.user（SafeUser）。 */
export function requireUser(req: Request, res: Response, next: NextFunction): void {
  const headerVal = req.headers[USER_TOKEN_HEADER]
  const token = Array.isArray(headerVal) ? headerVal[0] : headerVal
  if (!token) return void res.status(401).json({ code: 401, message: '未登录：请先登录后再操作', data: null })
  const user = currentUser(token)
  if (!user) return void res.status(401).json({ code: 401, message: '登录已过期：请重新登录', data: null })
  // 首次登录强制改密的服务端硬约束：改密/登出/当前用户之外的一切接口一律 403。
  // （此前只是前端弹窗提示，用户可以直接关掉弹窗继续用默认密码。）
  if (
    user.mustChangePassword &&
    !/^\/api\/auth\//.test(req.originalUrl || `${req.baseUrl}${req.path}`)
  ) {
    return void res.status(403).json({ code: 403, message: '请先修改初始密码后再使用平台', data: null })
  }
  const reqWithUser = req as Request & { user?: SafeUser }
  reqWithUser.user = user
  next()
}

/** Express 中间件：仅管理员可访问。 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = (req as Request & { user?: SafeUser }).user
  if (user?.role !== 'admin') {
    return void res.status(403).json({ code: 403, message: '无权限：此操作需要管理员身份', data: null })
  }
  next()
}

export const authService = {
  login,
  logout,
  currentUser,
  hashPassword,
  verifyPassword,
  safeUser,
  genId,
  USER_TOKEN_HEADER,
  SESSION_TTL_MS,
}