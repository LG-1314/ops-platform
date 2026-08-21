import { connectSsh, runCommand, type SshConnectParams } from './sshService'
import { credentialService } from './credentialService'
import { memoryStore } from '../store/memoryStore'
import { logger } from '../utils/logger'
import type {
  FirewallCollectResult,
  FirewallRule,
  FirewallStatus,
  ListeningPort,
  NetworkConnection,
  AddFirewallRuleInput,
} from '@shared/types'

// 防火墙管理 / 网络透视：经 SSH 采集目标主机 iptables 规则、监听端口、活动连接，
// 并支持带防呆校验的规则增删。全程只读命令除非用户显式添加/删除规则。

/** 简易分词：保留引号内内容（--comment "a b c" 视为一个 token）。 */
function tokenize(line: string): string[] {
  const out: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line)) !== null) {
    out.push(m[1] ?? m[2] ?? m[3])
  }
  return out
}

/** 解析单条 iptables -S 规则行 → 结构化 FirewallRule。 */
function parseRule(line: string): FirewallRule {
  const rule: FirewallRule = {
    chain: '',
    protocol: 'all',
    source: '',
    destination: '',
    port: '',
    action: '',
    raw: line,
  }
  const chainM = line.match(/^-A\s+(\S+)/)
  if (chainM) rule.chain = chainM[1]
  const tokens = tokenize(line)
  for (let i = 0; i < tokens.length; i += 1) {
    const tk = tokens[i]
    if (tk === '-p') rule.protocol = tokens[i + 1] || 'all'
    else if (tk === '-s') rule.source = tokens[i + 1] || ''
    else if (tk === '-d') rule.destination = tokens[i + 1] || ''
    else if (tk === '-i') rule.inInterface = tokens[i + 1] || ''
    else if (tk === '-o') rule.outInterface = tokens[i + 1] || ''
    else if (tk === '--dport' || tk === '--dports') {
      rule.port = rule.port ? `${rule.port},${tokens[i + 1] || ''}` : tokens[i + 1] || ''
    } else if (tk === '--sport') rule.sport = tokens[i + 1] || ''
    else if (tk === '-j') rule.action = tokens[i + 1] || ''
    else if (tk === '--comment') rule.comment = tokens[i + 1] || ''
  }
  return rule
}

/** 解析 iptables -S 输出：默认策略 + 规则列表。 */
export function parseFirewallRules(
  iptablesOut: string
): { rules: FirewallRule[]; policies: { chain: string; policy: string }[] } {
  const rules: FirewallRule[] = []
  const policies: { chain: string; policy: string }[] = []
  for (const line of iptablesOut.split('\n')) {
    const t = line.trim()
    if (!t) continue
    if (t.startsWith('#') || t.startsWith('*') || t.startsWith('COMMIT')) continue
    if (t.startsWith('-P ')) {
      const m = t.match(/^-P\s+(\S+)\s+(\S+)/)
      if (m) policies.push({ chain: m[1], policy: m[2] })
      continue
    }
    if (t.startsWith('-A ')) rules.push(parseRule(t))
  }
  return { rules, policies }
}

/** 解析 ss 监听端口输出（-tlnp）与连接输出（-tanp）。 */
function parseListeningPorts(ssOut: string): ListeningPort[] {
  const ports: ListeningPort[] = []
  for (const line of ssOut.split('\n')) {
    if (!line.includes('LISTEN')) continue
    const m = line.match(/^\s*(tcp|udp)\s+\S+\s+\S+\s+(\S+:\d+|\S+)\s+\S+\s*(.*)$/)
    if (!m) continue
    const local = m[2]
    const portM = local.match(/:(\d+)$/)
    if (!portM) continue
    const procM = m[3]?.match(/"([^"]+)".*pid=(\d+)/)
    ports.push({
      protocol: m[1] as 'tcp' | 'udp',
      address: local,
      port: Number(portM[1]),
      process: procM?.[1] || '?',
      pid: procM?.[2] ? Number(procM[2]) : 0,
    })
  }
  return ports
}

function parseConnections(ssOut: string): NetworkConnection[] {
  const conns: NetworkConnection[] = []
  for (const line of ssOut.split('\n')) {
    if (!line.trim()) continue
    const m = line.match(
      /^\s*(tcp6?|udp6?|raw)\s+\S+\s+\S+\s+(\S+:\d+)\s+(\S+:\d+)\s+(\S+)\s+(.*)$/
    )
    if (!m) continue
    const local = m[2]
    const remote = m[3]
    const localPortM = local.match(/:(\d+)$/)
    const remotePortM = remote.match(/:(\d+)$/)
    if (!localPortM || !remotePortM) continue
    const procM = m[5]?.match(/"([^"]+)".*pid=(\d+)/)
    conns.push({
      protocol: m[1],
      localAddress: local.slice(0, -localPortM[1].length - 1),
      localPort: Number(localPortM[1]),
      remoteAddress: remote.slice(0, -remotePortM[1].length - 1),
      remotePort: Number(remotePortM[1]),
      state: m[4],
      process: procM?.[1] || '',
    })
  }
  return conns
}

/** 一次性采集防火墙状态 + 规则 + 端口 + 连接。 */
export async function collectFirewall(
  params: SshConnectParams,
  assetId: string
): Promise<FirewallCollectResult> {
  const client = await connectSsh(params)
  try {
    const [iptablesOut, ssTlnpOut, ssTanpOut] = await Promise.all([
      runCommand(client, 'iptables -S 2>/dev/null || echo "__UNAVAILABLE__"', 8000).catch(() => '__UNAVAILABLE__'),
      runCommand(client, 'ss -tlnp 2>/dev/null | head -100', 8000).catch(() => ''),
      runCommand(client, 'ss -tanp 2>/dev/null | head -300', 8000).catch(() => ''),
    ])
    const { rules, policies } = parseFirewallRules(iptablesOut)
    const available = !iptablesOut.includes('__UNAVAILABLE__')
    const status: FirewallStatus = {
      available,
      enabled: rules.length > 0,
      defaultPolicies: policies,
      ruleCount: rules.length,
    }
    return {
      assetId,
      host: params.host,
      collectedAt: new Date().toISOString(),
      status,
      rules,
      ports: parseListeningPorts(ssTlnpOut),
      connections: parseConnections(ssTanpOut),
    }
  } finally {
    client.end()
  }
}

/** 校验规则输入：返回 null=通过，否则返回中文错误。 */
export function validateRuleInput(input: AddFirewallRuleInput): string | null {
  if (!input.chain) return '缺少链（chain），如 INPUT'
  if (!input.action) return '缺少动作（action），如 ACCEPT / DROP'
  if (!['INPUT', 'OUTPUT', 'FORWARD', 'PREROUTING', 'POSTROUTING'].includes(input.chain)) {
    return `未知链：${input.chain}`
  }
  if (!['ACCEPT', 'DROP', 'REJECT', 'RETURN'].includes(input.action.toUpperCase())) {
    return `不支持的动作用途：${input.action}（建议 ACCEPT / DROP / REJECT）`
  }
  // 防呆：DROP/REJECT 全部流量（无任何限定）极危险
  const dropAll =
    ['DROP', 'REJECT'].includes(input.action.toUpperCase()) &&
    !input.protocol &&
    !input.port &&
    !input.source &&
    !input.destination
  if (dropAll) return '危险操作：将丢弃/拒绝该链全部流量，请指定协议或端口范围'
  // 防呆：端口格式校验（1-65535，支持逗号分隔）
  if (input.port) {
    for (const p of input.port.split(',')) {
      const n = Number(p)
      if (!Number.isInteger(n) || n < 1 || n > 65535) return `无效端口：${p}（应为 1-65535 或逗号分隔）`
    }
  }
  return null
}

/** 构建 iptables 添加规则命令。 */
export function buildRuleCommand(input: AddFirewallRuleInput): string {
  const parts = [`-A ${input.chain}`]
  if (input.inInterface) parts.push(`-i ${input.inInterface}`)
  if (input.protocol && input.protocol !== 'all') parts.push(`-p ${input.protocol}`)
  if (input.source) parts.push(`-s ${input.source}`)
  if (input.destination) parts.push(`-d ${input.destination}`)
  if (input.port) {
    if (input.protocol === 'tcp' || input.protocol === 'udp') {
      parts.push(`-m ${input.protocol} --dport ${input.port}`)
    } else {
      parts.push(`--dport ${input.port}`)
    }
  }
  parts.push(`-j ${input.action}`)
  if (input.comment) parts.push(`-m comment --comment "${input.comment.replace(/"/g, '')}"`)
  return parts.join(' ')
}

/** 添加防火墙规则（先校验，再执行）。 */
export async function addFirewallRule(
  params: SshConnectParams,
  input: AddFirewallRuleInput
): Promise<{ ok: boolean; message: string; rule?: FirewallRule }> {
  const err = validateRuleInput(input)
  if (err) return { ok: false, message: err }
  const client = await connectSsh(params)
  try {
    const cmd = buildRuleCommand(input)
    const out = await runCommand(client, `iptables ${cmd} 2>&1`, 8000).catch((e) => `__ERR__${e.message}`)
    if (out.includes('__ERR__') || /No chain|does not exist|unknown option/i.test(out)) {
      return { ok: false, message: `执行失败：${out.replace('__ERR__', '').trim() || '未知错误'}` }
    }
    const rule = parseRule(`-A ${cmd.replace('-A ', '')}`)
    return { ok: true, message: '规则已添加', rule }
  } finally {
    client.end()
  }
}

/** 删除防火墙规则（按匹配：raw 为 iptables -S 行，-A 改 -D）。 */
export async function deleteFirewallRule(
  params: SshConnectParams,
  raw: string
): Promise<{ ok: boolean; message: string }> {
  if (!raw || !raw.startsWith('-A ')) return { ok: false, message: '无效的规则（缺少 -A 前缀）' }
  const client = await connectSsh(params)
  try {
    const cmd = raw.replace(/^-A /, '-D ')
    const out = await runCommand(client, `iptables ${cmd} 2>&1`, 8000).catch((e) => `__ERR__${e.message}`)
    if (out.includes('__ERR__') || /No chain|bad rule|does not exist/i.test(out)) {
      return { ok: false, message: `执行失败：${out.replace('__ERR__', '').trim() || '未知错误'}` }
    }
    return { ok: true, message: '规则已删除' }
  } finally {
    client.end()
  }
}

/** 从资产解析 SSH 连接参数（host/port/凭据）。 */
export function resolveSshParams(assetId: string): SshConnectParams | null {
  const asset = memoryStore.getAssets().find((a) => a.id === assetId)
  if (!asset) return null
  const secret = asset.credentialId ? credentialService.decrypt(asset.credentialId) : undefined
  if (!asset.credentialId || !secret) return null
  return {
    host: asset.host,
    port: asset.port,
    username: secret.username,
    password: secret.password,
    privateKey: secret.privateKey,
  }
}

export function logFirewallError(action: string, assetId: string, e: unknown): void {
  logger.error(`[firewall] ${action} failed asset=${assetId} err=${e instanceof Error ? e.message : String(e)}`)
}
