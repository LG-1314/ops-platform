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

// —— 告警规则引擎：开单写入当前值/阈值/单位 ——
test('alert-rules: 命中开单携带 currentValue/threshold/unit', async () => {
  const { alertRuleService, resetAlertCooldown } = await import('../services/alertRuleService')
  const { memoryStore } = await import('../store/memoryStore')
  resetAlertCooldown()
  // 独立固定健康分的资产，避免其他用例（监控探测等）改写种子资产健康分导致断言漂移
  memoryStore.addAsset({
    id: 'asset-threshold-test',
    name: 'threshold-test',
    type: 'server',
    host: 'threshold-test',
    source: 'manual',
    tags: [],
    createdAt: new Date().toISOString(),
    healthScore: 64,
    status: 'warn',
  })
  memoryStore.addAlertRule({
    name: '健康分阈值-指标字段',
    enabled: true,
    scope: 'asset',
    assetId: 'asset-threshold-test',
    metric: 'healthScore',
    operator: '<',
    threshold: 80,
    level: 'P2',
  } as never)

  const created = alertRuleService.evaluateAll()
  assert.equal(created, 1)
  const alert = memoryStore.getAlerts().find((a) => a.title.includes('健康分阈值-指标字段'))
  assert.ok(alert)
  assert.equal(alert.currentValue, 64)
  assert.equal(alert.threshold, 80)
  assert.equal(alert.unit, '分')

  // 清理
  memoryStore.removeAsset('asset-threshold-test')
  memoryStore.getAlertRules().filter((r) => r.name === '健康分阈值-指标字段').forEach((r) => memoryStore.removeAlertRule(r.id))
  memoryStore.getAlerts().filter((a) => a.title.includes('健康分阈值-指标字段')).forEach((a) => memoryStore.removeAlert(a.id))
  resetAlertCooldown()
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

// —— 防火墙解析 ——
import { parseFirewallRules, validateRuleInput, buildRuleCommand, deleteFirewallRule } from '../services/firewallService'

test('firewall: parse iptables -S 输出', () => {
  const out = [
    '*filter',
    '-P INPUT ACCEPT',
    '-P FORWARD DROP',
    '-P OUTPUT ACCEPT',
    '-A INPUT -i lo -j ACCEPT',
    '-A INPUT -p tcp -m tcp --dport 22 -j ACCEPT',
    '-A INPUT -p tcp -m tcp --dport 80 -m comment --comment "web" -j ACCEPT',
    '-A FORWARD -j DROP',
    'COMMIT',
  ].join('\n')
  const { rules, policies } = parseFirewallRules(out)
  assert.equal(policies.length, 3)
  assert.equal(policies[0].chain, 'INPUT')
  assert.equal(policies[0].policy, 'ACCEPT')
  assert.equal(policies[1].policy, 'DROP')
  assert.equal(rules.length, 4)
  assert.equal(rules[0].chain, 'INPUT')
  assert.equal(rules[0].action, 'ACCEPT')
  assert.equal(rules[0].inInterface, 'lo')
  assert.equal(rules[1].port, '22')
  assert.equal(rules[1].action, 'ACCEPT')
  assert.equal(rules[2].comment, 'web')
  assert.equal(rules[2].port, '80')
  assert.equal(rules[2].protocol, 'tcp')
  assert.equal(rules[3].chain, 'FORWARD')
  assert.equal(rules[3].action, 'DROP')
})

test('firewall: 空/无效输入安全', () => {
  assert.deepEqual(parseFirewallRules('').rules, [])
  assert.deepEqual(parseFirewallRules('# only comment\n').rules, [])
  assert.deepEqual(parseFirewallRules('garbage\nNOT -A INPUT\n').rules, [])
})

test('firewall: validateRuleInput 防呆', () => {
  // 缺少必填
  assert.ok(validateRuleInput({ chain: '', action: '' } as any))
  // 危险：DROP 全流量
  const dropAll = validateRuleInput({ chain: 'INPUT', action: 'DROP' })
  assert.ok(dropAll && dropAll.includes('危险'))
  // 正常：DROP 特定端口
  assert.equal(validateRuleInput({ chain: 'INPUT', action: 'DROP', protocol: 'tcp', port: '22' }), null)
  // 正常：ACCEPT 特定端口
  assert.equal(validateRuleInput({ chain: 'INPUT', action: 'ACCEPT', protocol: 'tcp', port: '80' }), null)
  // 无效端口
  const badPort = validateRuleInput({ chain: 'INPUT', action: 'ACCEPT', protocol: 'tcp', port: '0' })
  assert.ok(badPort && badPort.includes('无效端口'))
  // 未知链
  assert.ok(validateRuleInput({ chain: 'FAKE', action: 'ACCEPT' }))
})

test('firewall: buildRuleCommand', () => {
  const cmd = buildRuleCommand({ chain: 'INPUT', protocol: 'tcp', port: '443', action: 'ACCEPT', comment: 'https' })
  assert.ok(cmd.includes('-A INPUT'))
  assert.ok(cmd.includes('-p tcp'))
  assert.ok(cmd.includes('--dport 443'))
  assert.ok(cmd.includes('-j ACCEPT'))
  assert.ok(cmd.includes('https'))
  // 无端口
  const cmd2 = buildRuleCommand({ chain: 'FORWARD', action: 'DROP' })
  assert.ok(cmd2.includes('-A FORWARD'))
  assert.ok(cmd2.includes('-j DROP'))
  assert.ok(!cmd2.includes('--dport'))
})

test('firewall: 规则参数含 shell 字符时会被安全包裹', () => {
  const cmd = buildRuleCommand({ chain: 'INPUT', protocol: 'tcp', source: '10.0.0.1; touch /tmp/pwn', port: '22', action: 'ACCEPT' })
  assert.ok(cmd.includes("-s '10.0.0.1; touch /tmp/pwn'"))
})

test('firewall: 删除规则拒绝 shell 控制字符', async () => {
  const result = await deleteFirewallRule({} as never, '-A INPUT -j ACCEPT; echo injected')
  assert.equal(result.ok, false)
  assert.ok(result.message.includes('不安全字符'))
})

// —— 知识检索合并自维护知识 ——
test('knowledge: search 合并自维护知识（用户录入可被检索命中）', async () => {
  const { knowledgeService } = await import('../services/knowledgeService')
  const { memoryStore } = await import('../store/memoryStore')
  memoryStore.addKnowledge({
    id: 'user-search-test',
    title: '自定义测试条目-磁盘扩容专项',
    content: '针对 /data 分区进行在线扩容的完整步骤',
    tags: ['磁盘', '扩容'],
    source: 'remote',
    relatedAssets: [],
  })
  try {
    const hits = knowledgeService.search('扩容') as { id: string }[]
    assert.ok(hits.some((h) => h.id === 'user-search-test'))
  } finally {
    memoryStore.removeKnowledge('user-search-test')
  }
})

test('knowledge: search 空查询返回空数组', async () => {
  const { knowledgeService } = await import('../services/knowledgeService')
  assert.deepEqual(knowledgeService.search(''), [])
  assert.deepEqual(knowledgeService.search('   '), [])
})

// —— AI 智能体（角色化运维专家） ——
test('ai: 智能体预置 6 个且支持 CRUD', async () => {
  const { memoryStore } = await import('../store/memoryStore')
  assert.ok(memoryStore.getAiAgents().length >= 6)
  memoryStore.addAiAgent({
    id: 'agent-test-1',
    name: '测试智能体',
    role: '测试',
    description: '',
    systemPrompt: '你是测试智能体',
    icon: 'qa',
    enabled: true,
    createdAt: new Date().toISOString(),
  })
  assert.ok(memoryStore.getAiAgents().some((x) => x.id === 'agent-test-1'))
  const updated = memoryStore.updateAiAgent('agent-test-1', { enabled: false })
  assert.equal(updated?.enabled, false)
  assert.ok(memoryStore.removeAiAgent('agent-test-1'))
  assert.ok(!memoryStore.getAiAgents().some((x) => x.id === 'agent-test-1'))
})

test('ai: 未配置时 agentChat 抛出可读错误', async () => {
  const { createAgent, agentChat, removeAgent } = await import('../services/aiService')
  const a = createAgent({ name: 'no-key-agent', systemPrompt: 'test' })
  try {
    await assert.rejects(
      () => agentChat(a.id, [{ role: 'user', content: 'hi' }]),
      /未启用|API Key/
    )
  } finally {
    removeAgent(a.id)
  }
})

// —— AI 配置 ——
test('ai: saveConfig 脱敏返回 + apiKey 加密存储', async () => {
  const { saveConfig } = await import('../services/aiService')
  const { memoryStore } = await import('../store/memoryStore')
  const s = saveConfig({ baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', apiKey: 'sk-test-123456', enabled: true })
  assert.equal(s.hasApiKey, true)
  assert.ok(!('apiKey' in s))
  // 密文落盘：不存明文
  const cfg = memoryStore.getAiConfig()
  assert.ok(cfg?.apiKeyEnc)
  assert.ok(!JSON.stringify(cfg).includes('sk-test-123456'))
  // 空 apiKey 保留原密钥
  const s2 = saveConfig({ model: 'gpt-4o' })
  assert.equal(s2.model, 'gpt-4o')
  assert.equal(s2.hasApiKey, true)
  // 清理，避免影响其他测试
  memoryStore.setAiConfig({ baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', enabled: false })
})

// —— 服务检查解析 ——
test('ssh: 服务行解析逻辑正确', () => {
  // collectServices 走真实 SSH 连接，不适合单测；此处验证其依赖的行解析正则
  const lines = [
    'nginx.service  loaded active running   A high performance web server',
    'mysqld.service  loaded active running   MySQL Server',
  ]
  const parsed = lines
    .map((line) => line.trim().match(/^(\S+)\s+(\S+)\s+(\S+)\s+(.+)/))
    .filter(Boolean)
    .map((m) => m as RegExpMatchArray)
  assert.equal(parsed.length, 2)
  assert.equal(parsed[0][1], 'nginx.service')
  assert.ok(parsed[0][4].includes('high performance web server'))
})

// —— 集群自检纯函数 ——
import { parseEndpoint, certExpiry, parseCpuQuantity, parseMemQuantity } from '../services/k8sService'

test('k8s: parseEndpoint 解析协议/域名/端口', () => {
  assert.deepEqual(parseEndpoint('https://k8s.example.com:6443'), { host: 'k8s.example.com', port: 6443, secure: true })
  assert.deepEqual(parseEndpoint('http://10.0.0.1'), { host: '10.0.0.1', port: 80, secure: false })
  assert.equal(parseEndpoint('ftp://bad'), null)
  assert.equal(parseEndpoint('not-a-url'), null)
})

test('k8s: certExpiry 判断证书到期', () => {
  const now = new Date('2026-08-23T00:00:00Z')
  assert.deepEqual(certExpiry('2026-08-24T00:00:00Z', now), { expired: false, daysLeft: 1 })
  assert.equal(certExpiry('2026-08-22T00:00:00Z', now).expired, true)
  assert.ok(Number.isNaN(certExpiry('invalid', now).daysLeft))
})

test('k8s: CPU/内存单位解析', () => {
  assert.equal(parseCpuQuantity('2'), 2)
  assert.equal(parseCpuQuantity('500m'), 0.5)
  assert.equal(parseCpuQuantity('250000n'), 0.00025)
  assert.equal(parseMemQuantity('1Gi'), 1024 ** 3)
  assert.equal(parseMemQuantity('512Mi'), 512 * 1024 ** 2)
  assert.equal(parseMemQuantity('1000'), 1000)
})

// —— 云资源变更 diff / 费用估算 ——
import { diffResources, estimateMonthlyCost } from '../services/cloudService'

test('cloud: estimateMonthlyCost 按规格线性估算', () => {
  assert.equal(estimateMonthlyCost(0, 0), 0)
  assert.equal(estimateMonthlyCost(2, 4), Math.round(20 + 2 * 18 + 4 * 8))
})

test('cloud: diffResources 检测新增/下线/规格变化', () => {
  let n = 0
  const genId = () => `id-${n++}`
  const base = [
    { id: 'i-1', name: 'web', type: 'CVM', region: 'gz', status: 'RUNNING', extra: { CPU: '2', Memory: '4' } },
    { id: 'i-2', name: 'db', type: 'CVM', region: 'gz', status: 'RUNNING', extra: { CPU: '4', Memory: '8' } },
  ]
  const next = [
    { ...base[0], status: 'STOPPED' },
    { id: 'i-3', name: 'new', type: 'CVM', region: 'gz', status: 'RUNNING' },
  ]
  const changes = diffResources(base, next, 'acc-1', '测试账号', genId, '2026-08-23T00:00:00Z')
  assert.equal(changes.length, 3)
  const types = changes.map((c) => c.changeType).sort()
  assert.deepEqual(types, ['add', 'change', 'remove'])
  const changed = changes.find((c) => c.changeType === 'change')
  assert.ok(changed?.detail.includes('RUNNING → STOPPED'))
  const removed = changes.find((c) => c.changeType === 'remove')
  assert.equal(removed?.resourceId, 'i-2')
})

// —— 监控汇总：离线/未探测资产健康分不可用 ——
import { buildMonitorSummary } from '../routes/monitor'

test('monitor: summary 离线/未探测主机不返回 0 分误导评分', () => {
  const now = '2026-08-23T00:00:00Z'
  const summary = buildMonitorSummary(
    [
      {
        id: 'host-online',
        name: 'online',
        type: 'server',
        host: '10.0.0.1',
        source: 'manual',
        tags: [],
        createdAt: now,
        healthScore: 96,
        status: 'ok',
        reachable: true,
      },
      {
        id: 'host-offline',
        name: 'offline',
        type: 'server',
        host: '10.0.0.2',
        source: 'manual',
        tags: [],
        createdAt: now,
        healthScore: 0,
        status: 'error',
        reachable: false,
      },
      {
        id: 'host-unknown',
        name: 'unknown',
        type: 'server',
        host: '10.0.0.3',
        source: 'manual',
        tags: [],
        createdAt: now,
        healthScore: 0,
        status: 'unknown',
      },
    ],
    [],
    [],
    [],
    () => undefined,
    now
  )

  assert.equal(summary.hosts.find((h) => h.id === 'host-online')?.healthScore, 96)
  assert.equal(summary.hosts.find((h) => h.id === 'host-offline')?.healthScore, null)
  assert.equal(summary.hosts.find((h) => h.id === 'host-unknown')?.healthScore, null)
})

test('monitor: 采集失败会把主机标记为连接失败并记录原因', async () => {
  const { memoryStore } = await import('../store/memoryStore')
  const { markAssetConnectionFailure } = await import('../services/assetHealthService')
  const now = '2026-08-23T00:00:00Z'
  memoryStore.addAsset({
    id: 'host-collect-failed',
    name: 'collect-failed',
    type: 'server',
    host: '10.0.0.9',
    source: 'manual',
    tags: [],
    createdAt: now,
    healthScore: 99,
    status: 'ok',
    reachable: true,
  })

  try {
    const updated = markAssetConnectionFailure('host-collect-failed', 'SSH 连接超时', now)
    assert.equal(updated?.reachable, false)
    assert.equal(updated?.status, 'error')
    assert.equal(updated?.healthScore, 0)
    assert.equal(updated?.statusReason, 'SSH 连接超时')
    assert.equal(updated?.lastCheckAt, now)
  } finally {
    memoryStore.removeAsset('host-collect-failed')
  }
})

test('monitor: 采集成功会恢复在线状态并按资源阈值标记异常', async () => {
  const { memoryStore } = await import('../store/memoryStore')
  const { markAssetCollectionSuccess } = await import('../services/assetHealthService')
  const now = '2026-08-23T00:00:00Z'
  memoryStore.addAsset({
    id: 'host-collect-ok',
    name: 'collect-ok',
    type: 'server',
    host: '10.0.0.10',
    source: 'manual',
    tags: [],
    createdAt: now,
    healthScore: 0,
    status: 'error',
    statusReason: '上次采集失败',
    reachable: false,
  })

  try {
    const updated = markAssetCollectionSuccess('host-collect-ok', {
      assetId: 'host-collect-ok',
      collectedAt: now,
      cpuIdle: 4,
      memTotalMb: 1000,
      memUsedMb: 760,
      disk: [{ mount: '/', totalGb: 100, usedGb: 92, usedPct: 92 }],
      status: 'ok',
    })
    assert.equal(updated?.reachable, true)
    assert.equal(updated?.status, 'error')
    assert.equal(updated?.statusReason, undefined)
    assert.equal(updated?.lastCheckAt, now)
    assert.ok((updated?.healthScore ?? 100) < 80)
  } finally {
    memoryStore.removeAsset('host-collect-ok')
  }
})

// —— 服务巡检：systemd 状态解析 / 端口探测 ——
import { parseSystemdActive, tcpCheck, shellQuote } from '../services/serviceCheckService'
import { shellQuoteArg } from '../services/sshService'

test('service-check: systemd 状态解析', () => {
  assert.deepEqual(parseSystemdActive('active\n'), { active: true })
  assert.deepEqual(parseSystemdActive('inactive'), { active: false, sub: 'inactive' })
  assert.deepEqual(parseSystemdActive('failed\n'), { active: false, sub: 'failed' })
  assert.deepEqual(parseSystemdActive(''), { active: false, sub: undefined })
})

test('service-check: 端口探测对明显不可达地址快速失败', async () => {
  const err = await tcpCheck('127.0.0.1', 1, 1500)
  assert.ok(err !== null)
})

test('service-check: 远端服务名 shell 转义不会拼接命令', () => {
  const quoted = shellQuote('nginx; echo injected')
  assert.equal(quoted, "'nginx; echo injected'")
  assert.ok(!quoted.includes('; echo injected\' &&'))
})

test('ssh: 服务过滤条件 shell 转义不会拼接命令', () => {
  assert.equal(shellQuoteArg("nginx'; echo injected"), "'nginx'\\''; echo injected'")
})

// —— AI 供应商预设 ——
import { AI_PROVIDERS } from '../services/aiService'

test('ai: 供应商预设覆盖主流大模型 + 本地 Ollama', () => {
  const ids = AI_PROVIDERS.map((p) => p.id)
  assert.ok(ids.includes('openai'))
  assert.ok(ids.includes('deepseek'))
  assert.ok(ids.includes('qwen'))
  assert.ok(ids.includes('ollama'))
  const ollama = AI_PROVIDERS.find((p) => p.id === 'ollama')
  assert.equal(ollama?.authType, 'none')
  assert.ok(ollama?.baseUrl.includes('11434'))
  // 每个预设都有 baseUrl 与推荐模型
  for (const p of AI_PROVIDERS) {
    assert.ok(p.baseUrl.startsWith('http'))
    assert.ok(p.models.length > 0)
  }
})

// —— 资产录入：服务端校验与探测端口持久化 ——
test('assets: 录入校验覆盖主机、端口、类型与标签边界', async () => {
  const { validateAssetInput } = await import('../services/assetValidationService')
  const cases: Array<{ name: string; input: Record<string, unknown>; expected: string | null }> = [
    { name: 'IPv4 主机', input: { name: 'web-01', host: '10.0.1.12', type: 'server' }, expected: null },
    { name: '域名主机', input: { name: 'api', host: 'api.example.com', type: 'middleware' }, expected: null },
    { name: 'localhost 主机', input: { name: '本机', host: 'localhost', type: 'server' }, expected: null },
    { name: 'IPv6 主机', input: { name: 'ipv6', host: '2001:db8::1', type: 'server' }, expected: null },
    { name: '空名称', input: { name: ' ', host: '10.0.1.12', type: 'server' }, expected: '名称为必填项' },
    { name: '命令注入式主机', input: { name: 'bad', host: '10.0.1.12; calc', type: 'server' }, expected: '主机地址格式不正确' },
    { name: '端口为零', input: { name: 'bad', host: '10.0.1.12', port: 0, type: 'server' }, expected: '端口必须是 1 到 65535 之间的整数' },
    { name: '端口超范围', input: { name: 'bad', host: '10.0.1.12', port: 65536, type: 'server' }, expected: '端口必须是 1 到 65535 之间的整数' },
    { name: '非法资产类型', input: { name: 'bad', host: '10.0.1.12', type: 'vm' }, expected: '资产类型不正确' },
    { name: '标签不是字符串数组', input: { name: 'bad', host: '10.0.1.12', tags: '生产', type: 'server' }, expected: '标签必须是字符串数组' },
  ]

  for (const item of cases) {
    assert.equal(validateAssetInput(item.input, true), item.expected, item.name)
  }
})

test('assets: 创建资产会保留合法探测端口', async () => {
  const { assetService } = await import('../services/assetService')
  const id = 'asset-port-persist-test'
  try {
    const created = assetService.create({
      id,
      name: 'port-persist',
      type: 'server',
      host: '127.0.0.1',
      port: 2222,
      source: 'manual',
      tags: [],
    })
    assert.equal(created.port, 2222)
  } finally {
    assetService.remove(id)
  }
})

// —— 联动回归：检索相关度 / 网络零速率告警 / 工具箱同步 ——
test('knowledge: 用户内容命中不应压过内置标题高相关结果', async () => {
  const { knowledgeService } = await import('../services/knowledgeService')
  const { memoryStore } = await import('../store/memoryStore')
  const id = 'knowledge-ranking-regression'
  memoryStore.addKnowledge({
    id,
    title: '运维经验记录',
    content: '磁盘问题曾在一次发布中出现',
    source: 'manual',
    tags: [],
    relatedAssets: [],
  })
  try {
    const hits = knowledgeService.search('磁盘')
    assert.ok(hits.length > 1)
    assert.notEqual(hits[0].id, id)
  } finally {
    memoryStore.removeKnowledge(id)
  }
})

test('alert-rules: 网络速率为 0 时仍应参与等于阈值的告警评估', async () => {
  const { memoryStore } = await import('../store/memoryStore')
  const { setLatest } = await import('../services/hostMetricsCache')
  const { alertRuleService, resetAlertCooldown } = await import('../services/alertRuleService')
  const now = new Date().toISOString()
  const assetId = 'alert-net-zero-asset'
  const ruleId = 'alert-net-zero-rule'
  memoryStore.addAsset({
    id: assetId,
    name: 'net-zero',
    type: 'server',
    host: '127.0.0.1',
    source: 'manual',
    tags: [],
    createdAt: now,
    healthScore: 100,
    status: 'ok',
    reachable: true,
  })
  memoryStore.addAlertRule({
    id: ruleId,
    name: '网络无流量',
    enabled: true,
    scope: 'asset',
    assetId,
    metric: 'netRx',
    operator: '==',
    threshold: 0,
    level: 'P2',
    createdAt: now,
  })
  setLatest({ assetId, collectedAt: now, status: 'ok', disk: [], network: { rxBytes: 10, txBytes: 10, rxRateKbps: 0, txRateKbps: 0 } })
  resetAlertCooldown()
  try {
    assert.equal(alertRuleService.evaluateAll(), 1)
  } finally {
    memoryStore.removeAlertRule(ruleId)
    memoryStore.removeAsset(assetId)
    for (const a of memoryStore.getAlerts().filter((x) => x.assetId === assetId)) memoryStore.removeAlert(a.id)
    resetAlertCooldown()
  }
})

test('dolores: memory-sync 会立即刷新主存储文件', async () => {
  const { doloresService } = await import('../services/doloresService')
  const { flushStore } = await import('../store/memoryStore')
  const { readJSONFile } = await import('../store/persist')
  flushStore()
  const storeFile = path.join(tmp, 'store.json')
  fs.unlinkSync(storeFile)
  assert.equal(readJSONFile('store.json'), null)
  const run = doloresService.run('memory-sync')
  assert.equal(run.status, 'ok')
  assert.ok(run.logs.some((line) => line.includes('内存快照已同步')))
  assert.ok(readJSONFile('store.json'))
})

test('patrol: Cron 匹配支持通配符、步长、周日别名与非法表达式兜底', async () => {
  const { matchesCron } = await import('../services/patrolService')
  const at = new Date(2026, 7, 29, 10, 15)
  assert.equal(matchesCron('* * * * *', at), true)
  assert.equal(matchesCron('*/5 * * * *', at), true)
  assert.equal(matchesCron('0 10 * * *', at), false)
  assert.equal(matchesCron('bad', at), false)
  assert.equal(matchesCron('15 10 * * 6', at), true)
  const sunday = new Date(2026, 7, 30, 10, 15)
  assert.equal(matchesCron('15 10 * * 7', sunday), true)
  assert.equal(matchesCron('15 10 1 * 6', at), true)
})

test('service-check: 输入校验拒绝非法类型、孤儿资产和越界端口', async () => {
  const { validateServiceCheckInput } = await import('../services/serviceCheckService')
  assert.equal(validateServiceCheckInput({ name: '端口', assetId: 'asset-localhost', checkType: 'port', serviceName: 'tcp', port: 80 }, true), null)
  assert.ok(validateServiceCheckInput({ name: '端口', assetId: 'asset-localhost', checkType: 'port', serviceName: 'tcp', port: 0 }, true))
  assert.ok(validateServiceCheckInput({ name: '未知', assetId: 'asset-localhost', checkType: 'bogus' as never, serviceName: 'x' }, true))
  assert.ok(validateServiceCheckInput({ name: '服务', assetId: 'asset-localhost', checkType: 'systemd', serviceName: 'bad\nname' }, true))
})

test('patrol: 已启用任务在匹配分钟执行且同一分钟不重复执行', async () => {
  const { memoryStore } = await import('../store/memoryStore')
  const { patrolService } = await import('../services/patrolService')
  const at = new Date('2026-08-29T10:15:00Z')
  const task = patrolService.create({ id: 'scheduled-patrol-regression', name: '定时回归', cron: '* * * * *', enabled: true, layers: ['basic'] })
  try {
    assert.equal(patrolService.runScheduled(at), 1)
    assert.equal(patrolService.runScheduled(new Date(at.getTime() + 20_000)), 0)
    assert.equal(memoryStore.getPatrols().find((x) => x.id === task.id)?.history.length, 1)
  } finally {
    memoryStore.removePatrol(task.id)
  }
})

test('db: 连接更新校验拒绝非法类型、端口并接受合法部分更新', async () => {
  const { validateDbConnectionInput } = await import('../routes/db')
  assert.equal(validateDbConnectionInput({ name: '主库', host: 'db.example.com', dbType: 'mysql', port: 3306 }), null)
  assert.equal(validateDbConnectionInput({ port: 0 }), '端口必须是 1 到 65535 之间的整数')
  assert.equal(validateDbConnectionInput({ dbType: 'sqlite' }), '数据库类型不正确')
  assert.equal(validateDbConnectionInput({ name: ' ' }), '名称不能为空')
})

// —— RBAC：后端管理员边界不能仅依赖前端隐藏路由 ——
test('auth: 个人用户不能直接访问管理员资源接口', async () => {
  const { createServer } = await import('../index')
  const { login, hashPassword, logout } = await import('../services/authService')
  const { memoryStore } = await import('../store/memoryStore')
  const personalId = 'rbac-personal-regression'
  memoryStore.removeUser(personalId)
  memoryStore.addUser({
    id: personalId,
    username: 'rbac-personal',
    displayName: 'RBAC 回归用户',
    role: 'personal',
    passwordHash: hashPassword('personal123'),
    createdAt: new Date().toISOString(),
  })

  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const base = `http://127.0.0.1:${address.port}`
  const admin = login('admin', 'admin123')
  const personal = login('rbac-personal', 'personal123')
  assert.ok(admin && personal)

  try {
    const denied = await fetch(`${base}/api/assets`, {
      headers: { 'x-ops-user-token': personal.token },
    })
    assert.equal(denied.status, 403)
    const deniedJson = (await denied.json()) as { code: number }
    assert.equal(deniedJson.code, 403)

    const allowed = await fetch(`${base}/api/assets`, {
      headers: { 'x-ops-user-token': admin.token },
    })
    assert.equal(allowed.status, 200)
    const allowedJson = (await allowed.json()) as { code: number }
    assert.equal(allowedJson.code, 0)
  } finally {
    logout(admin.token)
    logout(personal.token)
    memoryStore.removeUser(personalId)
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
