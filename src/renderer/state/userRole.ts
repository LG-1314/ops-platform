import { useCallback, useSyncExternalStore } from 'react'
import type { UserRole, SafeUser } from '@shared/types'
import { USER_TOKEN_KEY, USER_INFO_KEY } from '../../capabilities/bus'

// 身份状态（RBAC）：由登录会话驱动，localStorage 持久化。
// - 未登录：无 token，路由守卫跳转登录页
// - admin：完整运维管理员视图（所有模块 + 用户管理）
// - personal：个人用户精简视图（常用模块子集）
// 供 TopBar 显示当前用户 + Sidebar 过滤菜单 + App 路由守卫。

interface Session {
  token: string | null
  user: SafeUser | null
}

const STORAGE_KEY = 'ops-user-role' // 兼容旧版本地身份（无登录时兜底）

function readUser(): SafeUser | null {
  try {
    const raw = localStorage.getItem(USER_INFO_KEY)
    return raw ? (JSON.parse(raw) as SafeUser) : null
  } catch {
    return null
  }
}

function readToken(): string | null {
  try {
    return localStorage.getItem(USER_TOKEN_KEY)
  } catch {
    return null
  }
}

const initialUser = readUser()
const initialToken = readToken()

let session: Session = { token: initialToken, user: initialUser }
const listeners = new Set<() => void>()

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function emit(): void {
  for (const cb of listeners) cb()
}

/** 当前登录用户（未登录为 null）。 */
export function useUser(): SafeUser | null {
  return useSyncExternalStore(subscribe, () => session.user)
}

/** 当前角色：未登录返回 'personal'（保守）；登录后取用户角色。 */
export function useUserRole(): UserRole {
  return useSyncExternalStore(subscribe, () => session.user?.role ?? 'personal')
}

/** 是否已登录。 */
export function useIsLoggedIn(): boolean {
  return useSyncExternalStore(subscribe, () => Boolean(session.token))
}

/** 登录成功：写入 token + user 并通知。 */
export function setSession(token: string, user: SafeUser): void {
  session = { token, user }
  try {
    localStorage.setItem(USER_TOKEN_KEY, token)
    localStorage.setItem(USER_INFO_KEY, JSON.stringify(user))
  } catch {
    /* ignore */
  }
  emit()
}

/** 登出：清除会话。 */
export function clearSession(): void {
  session = { token: null, user: null }
  try {
    localStorage.removeItem(USER_TOKEN_KEY)
    localStorage.removeItem(USER_INFO_KEY)
  } catch {
    /* ignore */
  }
  emit()
}

/** 供 TopBar 身份切换（登录后手动切换视角；未登录无意义，被路由守卫拦截）。 */
export function setUserRole(role: UserRole): void {
  if (!session.user) return
  session = { ...session, user: { ...session.user, role } }
  try {
    localStorage.setItem(USER_INFO_KEY, JSON.stringify(session.user))
    localStorage.setItem(STORAGE_KEY, role)
  } catch {
    /* ignore */
  }
  emit()
}

/** 更新当前登录用户信息（改密后清除 mustChangePassword 标记等）。 */
export function updateUserInfo(patch: Partial<SafeUser>): void {
  if (!session.user) return
  session = { ...session, user: { ...session.user, ...patch } }
  try {
    localStorage.setItem(USER_INFO_KEY, JSON.stringify(session.user))
  } catch {
    /* ignore */
  }
  emit()
}

export function getUserRole(): UserRole {
  return session.user?.role ?? 'personal'
}

export function useSetUserRole(): (role: UserRole) => void {
  return useCallback((role: UserRole) => setUserRole(role), [])
}
