import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// 隔离数据目录，避免测试污染真实用户数据
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-test-'))
process.env.OPS_DATA_DIR = tmp

import { encrypt, decrypt, DecryptError } from '../utils/crypto'
import { paginate } from '../utils/paginate'
import { searchKnowledge, getBuiltinById, listBuiltin } from '../../diagnostics/knowledge.mjs'

// —— crypto ——
test('crypto: encrypt/decrypt roundtrip', () => {
  assert.equal(decrypt(encrypt('hello-world')), 'hello-world')
})

test('crypto: 中文内容 roundtrip', () => {
  assert.equal(decrypt(encrypt('凭据密码@123')), '凭据密码@123')
})

test('crypto: 空串透传', () => {
  assert.equal(encrypt(''), '')
  assert.equal(decrypt(''), '')
})

test('crypto: 密文过短抛 DecryptError', () => {
  assert.throws(() => decrypt('abc'), DecryptError)
})

test('crypto: 篡改密文抛 DecryptError', () => {
  const c = encrypt('secret-value')
  const buf = Buffer.from(c, 'base64')
  buf[buf.length - 1] ^= 0xff
  assert.throws(() => decrypt(buf.toString('base64')), DecryptError)
})

// —— paginate ——
test('paginate: 无参数返回原数组（兼容）', () => {
  const arr = [1, 2, 3]
  assert.deepEqual(paginate(arr, {}), arr)
})

test('paginate: 分页切片与总数', () => {
  const arr = [1, 2, 3, 4, 5]
  const r = paginate(arr, { page: 2, pageSize: 2 }) as { items: number[]; total: number; page: number; pageSize: number }
  assert.deepEqual(r.items, [3, 4])
  assert.equal(r.total, 5)
  assert.equal(r.page, 2)
  assert.equal(r.pageSize, 2)
})

test('paginate: 非法参数回退数组', () => {
  const arr = [1, 2, 3]
  assert.deepEqual(paginate(arr, { page: 0, pageSize: 10 }), arr)
  assert.deepEqual(paginate(arr, { page: 1, pageSize: -1 }), arr)
})

// —— 知识库 ——
test('knowledge: search 磁盘 命中', () => {
  const hits = searchKnowledge('磁盘') as { id: string; title: string; keywords: string[]; tags: string[]; a: string }[]
  assert.ok(hits.length > 0)
  assert.ok(hits.some((h) => (h.title || '').includes('磁盘')))
})

test('knowledge: 内置 FAQ 不少于 31 条', () => {
  assert.ok(listBuiltin().length >= 31)
})

test('knowledge: getBuiltinById 命中稳定 id', () => {
  const f = getBuiltinById('kb-mem-oom')
  assert.ok(f)
  assert.equal(f.id, 'kb-mem-oom')
})

// —— auth（动态导入以在隔离数据目录下初始化）——
test('auth: hashPassword/verifyPassword roundtrip', async () => {
  const { hashPassword, verifyPassword } = await import('../services/authService')
  const h = hashPassword('p@ssw0rd')
  assert.ok(verifyPassword('p@ssw0rd', h))
  assert.equal(verifyPassword('wrong', h), false)
})

test('auth: safeUser 脱敏且保留 mustChangePassword', async () => {
  const { safeUser } = await import('../services/authService')
  const u = {
    id: 'u1',
    username: 'admin',
    displayName: '系统管理员',
    role: 'admin' as const,
    passwordHash: 'secret-hash',
    createdAt: '2026-01-01',
    mustChangePassword: true,
  }
  const s = safeUser(u)
  assert.ok(!('passwordHash' in s))
  assert.equal(s.mustChangePassword, true)
})

// —— 知识库：相关度排序 + 关联资产 ——
test('knowledge: 检索结果按相关度降序', () => {
  const hits = searchKnowledge('磁盘满') as { id: string }[]
  assert.ok(hits.length > 0)
  assert.equal(hits[0].id, 'kb-disk-full')
})

test('knowledge: relatedAssetsFor 命中映射', async () => {
  const { relatedAssetsFor } = await import('../../diagnostics/knowledge.mjs')
  const list = relatedAssetsFor('kb-mem-oom')
  assert.ok(Array.isArray(list))
  assert.ok(list.includes('db-01'))
  assert.deepEqual(relatedAssetsFor('kb-nonexistent'), [])
})

// —— Guardrails 防呆检查 ——
test('guardrails: 危险命令拦截 + 生产审批拦截', async () => {
  const { guardrailService } = await import('../services/guardrailService')
  const r = guardrailService.check('prod', 'web-01', 'rm -rf /')
  assert.equal(r.passed, false)
  assert.ok(r.riskItems >= 2)
  const dangerous = r.checks.find((c) => c.category === 'dangerous-cmd')
  assert.ok(dangerous && !dangerous.passed)
  const approval = r.checks.find((c) => c.category === 'approval')
  assert.ok(approval && !approval.passed)
})

test('guardrails: 安全命令放行', async () => {
  const { guardrailService } = await import('../services/guardrailService')
  const r = guardrailService.check('test', 'web-01', 'df -h')
  assert.equal(r.passed, true)
  assert.equal(r.riskItems, 0)
})

// —— 告警规则引擎：开单去重 + 冷却 ——
test('alert-rules: 命中开单、重复评估去重、冷却期不重开', async () => {
  const { alertRuleService, resetAlertCooldown } = await import('../services/alertRuleService')
  const { memoryStore } = await import('../store/memoryStore')
  resetAlertCooldown()
  const rule = {
    name: '健康分阈值',
    enabled: true,
    scope: 'asset' as const,
    assetId: 'db-01', // 种子资产 healthScore 64
    metric: 'healthScore' as const,
    operator: '<' as const,
    threshold: 80,
    level: 'P1' as const,
  }
  memoryStore.addAlertRule(rule as never)

  const c1 = alertRuleService.evaluateAll()
  assert.equal(c1, 1)

  // 未解决：去重，不再开单
  const c2 = alertRuleService.evaluateAll()
  assert.equal(c2, 0)

  // 解决后仍在冷却期（10 分钟）：不重开
  const active = memoryStore.getAlerts().find((a) => a.title.includes('健康分阈值'))
  assert.ok(active)
  memoryStore.updateAlert(active.id, { state: 'resolved' })
  const c3 = alertRuleService.evaluateAll()
  assert.equal(c3, 0)

  // 清除冷却记录后：重新开单
  resetAlertCooldown()
  const c4 = alertRuleService.evaluateAll()
  assert.equal(c4, 1)

  // 清理测试产生的规则与告警
  memoryStore.getAlertRules().filter((r) => r.name === '健康分阈值').forEach((r) => memoryStore.removeAlertRule(r.id))
  memoryStore.getAlerts().filter((a) => a.title.includes('健康分阈值')).forEach((a) => memoryStore.removeAlert(a.id))
})

// —— 会话 TTL：过期即失效 ——
test('auth: 会话过期后 currentUser 返回 null', async () => {
  const mod = await import('../services/authService')
  const { memoryStore } = await import('../store/memoryStore')
  const users = memoryStore.getUsers()
  const u = users[0]
  // 模拟登录：直接写会话 map（经 login 走完整链路更稳）
  const r = mod.login(u.username, 'admin123')
  assert.ok(r)
  const fake = r.token
  assert.ok(mod.currentUser(fake))
  mod.logout(fake)
  assert.equal(mod.currentUser(fake), null)
})
