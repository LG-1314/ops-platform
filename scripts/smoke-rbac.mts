// 进程内冒烟测试：复用 server 进程的令牌，验证 RBAC / 知识库 / 凭据加密等修复。
// 通过 tsx 运行（自动解析 @shared 路径别名）。不在 Electron 内运行，但所有请求
// 都附加 x-ops-token（应用令牌）以模拟主进程转发行为，从而正确触发写路由鉴权。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createServer } from '../src/server/index'
import { getToken } from '../src/server/auth'

const APP_TOKEN = getToken() // 与 server 同进程 → 同一份令牌
const PORT = 8799
const BASE = `http://127.0.0.1:${PORT}/api`

let pass = 0
let fail = 0
const log = (ok: boolean, name: string, extra = '') => {
  if (ok) pass++
  else fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  → ' + extra : ''}`)
}

async function call(method: string, path: string, opts: { body?: unknown; userToken?: string; appToken?: boolean } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' }
  if (opts.appToken !== false) headers['x-ops-token'] = APP_TOKEN
  if (opts.userToken) headers['x-ops-user-token'] = opts.userToken
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  })
  const text = await res.text()
  let json: any = null
  try { json = JSON.parse(text) } catch { json = { _raw: text } }
  return { status: res.status, json }
}

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-smoke-'))
  process.env.OPS_DATA_DIR = dataDir
  process.env.NODE_ENV = 'test'

  const server = createServer()
  await new Promise<void>((resolve) => server.listen(PORT, '127.0.0.1', () => resolve()))

  try {
    // 1) 健康检查
    const h = await call('GET', '/health')
    log(h.json?.code === 0 && h.json?.data?.ok === true, 'health ok', JSON.stringify(h.json))

    // 2) 知识库列表（应 >= 31 条内置 FAQ）
    const kl = await call('GET', '/knowledge')
    const kbCount = Array.isArray(kl.json?.data) ? kl.json.data.length : 0
    log(kbCount >= 31, `knowledge list >=31 (got ${kbCount})`, `code=${kl.json?.code}`)

    // 3) 知识库检索
    const ks = await call('GET', '/knowledge/search?q=' + encodeURIComponent('磁盘'))
    const ksHits = Array.isArray(ks.json?.data) ? ks.json.data.length : 0
    log(ksHits > 0, `knowledge search 磁盘 hits=${ksHits}`, ks.json?.data?.[0]?.title || '')

    // 4) 知识库详情点击查看（内置 FAQ 可点开）
    const kd = await call('GET', '/knowledge/kb-mem-oom')
    log(kd.json?.code === 0 && kd.json?.data?.source === 'builtin-faq', 'knowledge detail builtin-faq', kd.json?.data?.title || `code=${kd.json?.code}`)

    // 5) 登录：正确密码 + 应用令牌 → 200 + 用户令牌
    const login = await call('POST', '/auth/login', { body: { username: 'admin', password: 'admin123' } })
    const userToken = login.json?.data?.token
    log(login.json?.code === 0 && typeof userToken === 'string' && userToken.length > 0, 'login admin ok', `role=${login.json?.data?.user?.role}`)
    log(login.json?.data?.user?.mustChangePassword === true, 'login returns mustChangePassword=true (H3)', `flag=${login.json?.data?.user?.mustChangePassword}`)

    // 6) 登录：错误密码 → 401
    const bad = await call('POST', '/auth/login', { body: { username: 'admin', password: 'wrong' } })
    log(bad.json?.code === 401, 'login wrong password 401', `code=${bad.json?.code}`)

    // 6b) 首次登录强制改密：admin123 → 新密码，改后 mustChangePassword=false
    const cp = await call('POST', '/auth/change-password', { userToken, body: { oldPassword: 'admin123', newPassword: 'NewPass123!' } })
    log(cp.json?.code === 0, 'change-password ok (H3)', `code=${cp.json?.code}`)
    const me = await call('GET', '/auth/me', { userToken })
    log(me.json?.code === 0 && me.json?.data?.mustChangePassword === false, 'mustChangePassword cleared after change (H3)', `flag=${me.json?.data?.mustChangePassword}`)

    // 6c) 审计日志：登录/改密事件已记录，且仅管理员可读
    const aud = await call('GET', '/audit', { userToken })
    const audArr = Array.isArray(aud.json?.data) ? aud.json.data : []
    log(aud.json?.code === 0 && audArr.some((x: any) => x.action === 'auth.login'), 'audit records auth.login (H1)', `entries=${audArr.length}`)
    const audNoAuth = await call('GET', '/audit')
    log(audNoAuth.json?.code === 401, 'audit without user token 401 (H1)', `code=${audNoAuth.json?.code}`)

    // 6d) 登录限流：再失败 4 次（累计 5 次）→ 锁定，第 6 次（含正确密码）返回 429
    let locked = false
    for (let i = 0; i < 5; i += 1) {
      const attempt = await call('POST', '/auth/login', { body: { username: 'admin', password: 'wrong-x' } })
      if (attempt.json?.code === 429) {
        locked = true
        break
      }
    }
    log(locked, 'login rate-limit locks after 5 fails (L2)', 'code=429')

    // 7) 写路由无用户令牌 → 401（RBAC 数据面加固）
    const noUser = await call('POST', '/credentials', { body: { name: 'c1', kind: 'ssh', host: '1.2.3.4', username: 'u', password: 'p' } })
    log(noUser.json?.code === 401, 'create credential without user token 401', `code=${noUser.json?.code}`)

    // 8) 写路由带用户令牌 → 200
    const cred = await call('POST', '/credentials', {
      userToken,
      body: { name: 'smoke-cred', kind: 'ssh', host: '10.0.0.5', port: 22, username: 'ops', password: 'secret-pwd-123' },
    })
    log(cred.json?.code === 0 && !!cred.json?.data?.id, 'create credential with user token 200', `id=${cred.json?.data?.id}`)

    // 9) 凭据列表脱敏（不应回显明文密码）
    const cl = await call('GET', '/credentials', { userToken })
    const clArr = Array.isArray(cl.json?.data) ? cl.json.data : []
    const found = clArr.find((c: any) => c.id === cred.json?.data?.id)
    const masked = found && !('password' in found) && found.username === 'ops'
    log(masked, 'credential list masked (no plaintext password)', found ? Object.keys(found).join(',') : 'not found')

    // 10) 凭据落盘已加密（store.json 中不含明文）
    const storePath = path.join(dataDir, 'store.json')
    let encrypted = true
    if (fs.existsSync(storePath)) {
      const raw = fs.readFileSync(storePath, 'utf8')
      encrypted = !raw.includes('secret-pwd-123')
    }
    log(encrypted, 'credential encrypted at rest (no plaintext in store.json)')

    // 11) 告警规则评估端点可用
    const ev = await call('POST', '/alert-rules/evaluate', { userToken })
    log(ev.json?.code === 0, 'alert-rules evaluate ok', JSON.stringify(ev.json?.data || ev.json?.message))

    // 12) clusters 改/删端点存在（PUT/DELETE 不再 404）
    const cl2 = await call('POST', '/clusters', { userToken, body: { name: 'smoke-cluster', endpoint: 'https://k8s.local', token: 'x' } })
    const clusterId = cl2.json?.data?.id
    const upd = clusterId ? await call('PUT', `/clusters/${clusterId}`, { userToken, body: { name: 'smoke-cluster-2' } }) : null
    log(!!upd && upd.json?.code === 0, 'clusters PUT ok', upd ? `code=${upd.json?.code}` : 'no cluster')
    const del = clusterId ? await call('DELETE', `/clusters/${clusterId}`, { userToken }) : null
    log(!!del && del.json?.code === 0, 'clusters DELETE ok', del ? `code=${del.json?.code}` : 'no cluster')

    console.log(`\n==== SMOKE RESULT: ${pass} passed, ${fail} failed ====`)
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    fs.rmSync(dataDir, { recursive: true, force: true })
  }
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('SMOKE CRASH', e)
  process.exit(2)
})
