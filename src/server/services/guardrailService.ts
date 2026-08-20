import { memoryStore } from '../store/memoryStore'
import type { GuardrailCheck, GuardrailRun } from '@shared/types'

// 危险命令模式库（真实检测，非占位）：覆盖高危删除/格式化/自毁/权限过宽/管道直执行等。
// 命中即拦截，是发布/变更前的最后一道防呆闸门。
const DANGEROUS_PATTERNS: { pattern: RegExp; risk: 'high' | 'medium'; hint: string }[] = [
  // rm -rf / 根目录删除（可带可选尾随空白/结尾）
  { pattern: /\brm\s+-[a-z]*r[a-z]*f[a-z]*\s+\/(?:\s|$)/i, risk: 'high', hint: 'rm -rf / 根目录删除' },
  { pattern: /\brm\s+-[a-z]*r[a-z]*f[a-z]+\b.*\b(?:boot|etc|usr|var|home)\b/i, risk: 'high', hint: 'rm -rf 系统关键目录' },
  { pattern: /\bmkfs\.?\w*\s/i, risk: 'high', hint: 'mkfs 格式化磁盘' },
  { pattern: /\bdd\s+if=.*of=\/dev\/(?:sd|nvme|vd)/i, risk: 'high', hint: 'dd 写入物理磁盘' },
  { pattern: /\bshutdown\b|\bpoweroff\b|\breboot\s+-f/i, risk: 'high', hint: '关机 / 强制重启' },
  { pattern: /\bdrop\s+database\b|\bdrop\s+table\b/i, risk: 'high', hint: '删除数据库 / 数据表' },
  { pattern: /\bchmod\s+(?:-R\s+)?777\b/i, risk: 'medium', hint: 'chmod 777 权限过宽' },
  { pattern: /:\s*\(\s*\)\s*\{\s*:/i, risk: 'high', hint: 'fork 炸弹' },
  { pattern: /\bcurl\b.*\|\s*(?:sh|bash)\b/i, risk: 'medium', hint: 'curl 管道直执行' },
  { pattern: /\b>\/dev\/(?:sd|nvme|vd)/i, risk: 'high', hint: '直接写块设备' },
]

// 敏感信息明文模式（脱敏检查）：口令/密钥/私钥/手机号/平台令牌
const SECRET_PATTERNS: { pattern: RegExp; hint: string }[] = [
  { pattern: /(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key)\s*[=:]\s*\S+/i, hint: '明文口令/密钥' },
  { pattern: /AKID[0-9A-Za-z]{10,}|secret[0-9A-Za-z]{8,}/i, hint: '云厂商 AK/SK' },
  { pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, hint: '私钥内容' },
  { pattern: /1[3-9]\d{9}/, hint: '手机号' },
  { pattern: /(?:sk-|ghp_|xoxb-|glpat-)[0-9A-Za-z_-]{10,}/i, hint: '平台令牌' },
]

export const guardrailService = {
  /**
   * 防呆检查（真实规则引擎）：
   * 1. dangerous-cmd  危险命令检测（针对 content）
   * 2. desensitize    敏感信息明文扫描（针对 content）
   * 3. cross-device   目标设备是否已登记资产
   * 4. approval       变更范围是否含生产/正式环境（需审批）
   * 任一不通过即 riskItems>0、整体 passed=false。
   */
  check(scope: string, target: string, content?: string): GuardrailRun {
    const now = new Date().toISOString()
    const checks: GuardrailCheck[] = []

    const hasContent = Boolean(content && content.trim())
    const text = (content || '').trim()

    // 1) 危险命令
    if (hasContent) {
      const hits = DANGEROUS_PATTERNS.filter((p) => p.pattern.test(text))
      const worst = hits.some((h) => h.risk === 'high') ? 'high' : hits.length ? 'medium' : 'low'
      checks.push({
        id: 'g-dangerous-cmd',
        category: 'dangerous-cmd',
        target,
        risk: worst,
        passed: hits.length === 0,
        message: hits.length
          ? `检测到危险命令：${hits.map((h) => h.hint).join('、')}`
          : '未检测到危险命令（rm -rf /、格式化、删库等）。',
      })
      // 2) 脱敏
      const secHits = SECRET_PATTERNS.filter((p) => p.pattern.test(text))
      checks.push({
        id: 'g-desensitize',
        category: 'desensitize',
        target,
        risk: secHits.length ? 'high' : 'low',
        passed: secHits.length === 0,
        message: secHits.length
          ? `发现疑似敏感信息：${secHits.map((h) => h.hint).join('、')}（请先脱敏）`
          : '未发现明文敏感信息（密钥 / 令牌 / 手机号等）。',
      })
    } else {
      checks.push({
        id: 'g-dangerous-cmd',
        category: 'dangerous-cmd',
        target,
        risk: 'low',
        passed: true,
        message: '未提供命令内容，跳过危险命令检测。',
      })
      checks.push({
        id: 'g-desensitize',
        category: 'desensitize',
        target,
        risk: 'low',
        passed: true,
        message: '未提供内容，跳过敏感信息扫描。',
      })
    }

    // 3) 跨设备：目标必须是已登记资产（按 name/host/ip 匹配）
    const assets = memoryStore.getAssets()
    const known = Boolean(
      target &&
        assets.some(
          (a) => a.name === target || a.host === target || (a.ip && a.ip === target)
        )
    )
    checks.push({
      id: 'g-cross-device',
      category: 'cross-device',
      target,
      risk: known ? 'low' : 'medium',
      passed: known,
      message: known
        ? `目标设备 ${target} 已在资产库登记，允许操作。`
        : `目标设备 ${target || '(未指定)'} 未在资产库登记，请先录入资产再操作。`,
    })

    // 4) 审批：变更范围含生产/正式环境 → 需人工审批
    const prodScope = /(prod|production|生产|线上|正式)/i.test(scope)
    checks.push({
      id: 'g-approval',
      category: 'approval',
      target: scope,
      risk: prodScope ? 'high' : 'low',
      passed: !prodScope,
      message: prodScope
        ? '变更范围含「生产 / 正式」环境，需人工审批后方可执行。'
        : '变更范围非生产环境，无需审批。',
    })

    const riskItems = checks.filter((c) => !c.passed).length
    const run: GuardrailRun = {
      id: `guardrail-${Date.now().toString(36)}`,
      scope,
      target,
      checkedAt: now,
      checks,
      riskItems,
      passed: riskItems === 0,
      runType: 'check',
    }
    memoryStore.addGuardrailRun(run)
    return run
  },

  /** 检查历史（最新在前） */
  history(): GuardrailRun[] {
    return memoryStore.getGuardrailRuns()
  },
}
