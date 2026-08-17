import type { GuardrailResult, GuardrailCheck } from '@shared/types'

export const guardrailService = {
  /** OpenClaw 跨设备巡检 + 发布防呆（占位：返回脱敏/审批/跨设备检查结果） */
  check(scope: string, target?: string): GuardrailResult {
    const now = new Date().toISOString()
    const checks: GuardrailCheck[] = [
      {
        id: 'g-desensitize',
        category: 'desensitize',
        target: target || scope,
        risk: 'low',
        passed: true,
        message: '未发现明文敏感信息（密钥/手机号/IP 已脱敏）。',
      },
      {
        id: 'g-approval',
        category: 'approval',
        target: scope,
        risk: 'low',
        passed: true,
        message: '变更已通过审批流，存在有效审批单。',
      },
      {
        id: 'g-cross-device',
        category: 'cross-device',
        target: scope,
        risk: 'medium',
        passed: true,
        message: '跨设备操作已确认配对状态，无未授权设备。',
      },
    ]
    return {
      id: `guardrail-${Date.now().toString(36)}`,
      scope,
      checkedAt: now,
      checks,
      riskItems: checks.filter((c) => !c.passed).length,
      passed: checks.every((c) => c.passed),
    }
  },
}
