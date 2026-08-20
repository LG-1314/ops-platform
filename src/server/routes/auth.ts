import { Router, type Request } from 'express'
import { asyncHandler, ok, fail } from '../utils/response'
import { authService, requireUser } from '../services/authService'
import { memoryStore } from '../store/memoryStore'
import { auditService } from '../services/auditService'
import type { SafeUser } from '@shared/types'

export const authRouter = Router()

// —— 登录失败限流：按用户名维度滑动窗口，防暴力破解 ——
// 规则：10 分钟窗口内失败 ≥5 次 → 锁定 10 分钟，返回 429。
const loginAttempts = new Map<string, { count: number; firstAt: number; lockedUntil: number }>()
const MAX_FAILS = 5
const WINDOW_MS = 10 * 60 * 1000
const LOCK_MS = 10 * 60 * 1000

function lockRemainMs(username: string): number {
  const rec = loginAttempts.get(username)
  if (!rec) return 0
  const now = Date.now()
  if (rec.lockedUntil > now) return rec.lockedUntil - now
  if (now - rec.firstAt > WINDOW_MS) {
    loginAttempts.delete(username)
    return 0
  }
  return 0
}

function recordLoginFail(username: string): void {
  const now = Date.now()
  const rec = loginAttempts.get(username)
  if (!rec || now - rec.firstAt > WINDOW_MS) {
    loginAttempts.set(username, { count: 1, firstAt: now, lockedUntil: 0 })
    return
  }
  rec.count += 1
  if (rec.count >= MAX_FAILS) rec.lockedUntil = now + LOCK_MS
}

function clearLoginAttempts(username: string): void {
  loginAttempts.delete(username)
}

// 登录
authRouter.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body || {}
  if (!username || !password) return fail(res, 400, 'username 与 password 必填')
  const uname = String(username)
  const remain = lockRemainMs(uname)
  if (remain > 0) {
    return fail(res, 429, `登录尝试过于频繁，请 ${Math.ceil(remain / 60000)} 分钟后再试`)
  }
  const result = authService.login(uname, password)
  if (!result) {
    recordLoginFail(uname)
    return fail(res, 401, '用户名或密码错误')
  }
  clearLoginAttempts(uname)
  auditService.record('auth.login', uname)
  ok(res, result)
}))

// 登出
authRouter.post('/logout', asyncHandler(async (req, res) => {
  const token = req.headers[authService.USER_TOKEN_HEADER] as string
  if (token) authService.logout(token)
  ok(res, { ok: true })
}))

// 当前用户信息
authRouter.get('/me', requireUser, asyncHandler(async (req, res) => {
  const user = (req as Request & { user?: SafeUser }).user
  ok(res, user)
}))

// 修改密码
authRouter.post('/change-password', requireUser, asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body || {}
  if (!oldPassword || !newPassword) return fail(res, 400, 'oldPassword 与 newPassword 必填')
  if (newPassword.length < 6) return fail(res, 400, '新密码至少 6 位')
  const user = (req as Request & { user?: SafeUser }).user
  const u = memoryStore.getUsers().find((x) => x.id === user?.id)
  if (!u) return fail(res, 404, '用户不存在')
  if (!authService.verifyPassword(oldPassword, u.passwordHash)) return fail(res, 401, '旧密码错误')
  memoryStore.updateUser(u.id, { passwordHash: authService.hashPassword(newPassword), mustChangePassword: false })
  auditService.record('auth.change-password', u.username)
  ok(res, { ok: true })
}))