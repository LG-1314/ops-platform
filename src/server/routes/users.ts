import { Router } from 'express'
import { asyncHandler, ok, fail } from '../utils/response'
import { requireUser, requireAdmin, hashPassword, safeUser, getSafeUsers } from '../services/authService'
import { memoryStore } from '../store/memoryStore'
import type { UserAccount, UserRole } from '@shared/types'

export const usersRouter = Router()

// 用户列表（管理员）
usersRouter.get('/', requireUser, requireAdmin, asyncHandler(async (_req, res) => {
  ok(res, getSafeUsers())
}))

// 创建用户（管理员）
usersRouter.post('/', requireUser, requireAdmin, asyncHandler(async (req, res) => {
  const { username, password, displayName, role } = req.body || {}
  if (!username || !password) return fail(res, 400, 'username 与 password 必填')
  if (password.length < 6) return fail(res, 400, '密码至少 6 位')
  if (memoryStore.getUsers().some((x) => x.username === username)) {
    return fail(res, 409, '用户名已存在')
  }
  const u: UserAccount = {
    id: memoryStore.getUsers().length > 0
      ? `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
      : 'user-admin',
    username,
    displayName: displayName || username,
    role: (role === 'personal' ? 'personal' : 'admin') as UserRole,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  }
  const created = memoryStore.addUser(u)
  ok(res, safeUser(created))
}))

// 更新用户（管理员：改名/角色/重置密码）
usersRouter.put('/:id', requireUser, requireAdmin, asyncHandler(async (req, res) => {
  const { displayName, role, password } = req.body || {}
  const patch: Partial<UserAccount> = {}
  if (displayName !== undefined) patch.displayName = String(displayName)
  if (role === 'admin' || role === 'personal') patch.role = role as UserRole
  if (password) {
    if (password.length < 6) return fail(res, 400, '密码至少 6 位')
    patch.passwordHash = hashPassword(password)
  }
  // 防止最后一个管理员被降级
  const target = memoryStore.getUsers().find((x) => x.id === req.params.id)
  if (target?.role === 'admin' && patch.role === 'personal') {
    const admins = memoryStore.getUsers().filter((x) => x.role === 'admin')
    if (admins.length <= 1) return fail(res, 409, '不能降级最后一个管理员')
  }
  const updated = memoryStore.updateUser(req.params.id, patch)
  if (!updated) return fail(res, 404, '用户不存在')
  ok(res, safeUser(updated))
}))

// 删除用户（管理员）
usersRouter.delete('/:id', requireUser, requireAdmin, asyncHandler(async (req, res) => {
  const okRemoved = memoryStore.removeUser(req.params.id)
  if (!okRemoved) return fail(res, 404, '用户不存在或不能删除最后一个管理员')
  ok(res, { ok: true })
}))