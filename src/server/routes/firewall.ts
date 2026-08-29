import { Router } from 'express'
import { asyncHandler, ok, fail } from '../utils/response'
import { requireUser, requireAdmin } from '../services/authService'
import { collectFirewall, addFirewallRule, deleteFirewallRule, resolveSshParams, logFirewallError } from '../services/firewallService'
import { auditService } from '../services/auditService'
import type { AddFirewallRuleInput } from '@shared/types'

export const firewallRouter = Router()

firewallRouter.use(requireUser, requireAdmin)

// 采集防火墙状态 + 规则 + 监听端口 + 连接（经资产关联的 SSH 凭据）
firewallRouter.get('/:assetId/collect', asyncHandler(async (req, res) => {
  const assetId = req.params.assetId
  const params = resolveSshParams(assetId)
  if (!params) return fail(res, 400, '该资产未关联 SSH 凭据，请先在「资产纳管」为主机配置凭据')
  try {
    const result = await collectFirewall(params, assetId)
    ok(res, result)
  } catch (e) {
    logFirewallError('collect', assetId, e)
    fail(res, 502, '防火墙采集失败：目标主机不可达或命令执行错误，请检查主机连通性与凭据')
  }
}))

// 添加规则（带防呆校验）
firewallRouter.post('/:assetId/rule', asyncHandler(async (req, res) => {
  const assetId = req.params.assetId
  const params = resolveSshParams(assetId)
  if (!params) return fail(res, 400, '该资产未关联 SSH 凭据')
  const input = (req.body || {}) as AddFirewallRuleInput
  try {
    const result = await addFirewallRule(params, input)
    if (!result.ok) return fail(res, 422, result.message)
    auditService.record('firewall.add-rule', `asset=${assetId}`, `${input.chain} ${input.protocol || 'all'} ${input.port || 'any'} ${input.action}`)
    ok(res, result)
  } catch (e) {
    logFirewallError('add-rule', assetId, e)
    fail(res, 502, '添加规则失败：SSH 连接或命令执行出错')
  }
}))

// 删除规则（按匹配：前端传采集得到的 raw 规则行；支持 query 或 body 传参）
firewallRouter.delete('/:assetId/rule', asyncHandler(async (req, res) => {
  const assetId = req.params.assetId
  const params = resolveSshParams(assetId)
  if (!params) return fail(res, 400, '该资产未关联 SSH 凭据')
  const raw = typeof req.query.raw === 'string' ? req.query.raw : typeof req.body?.raw === 'string' ? req.body.raw : ''
  if (!raw) return fail(res, 400, '缺少规则内容（raw）')
  try {
    const result = await deleteFirewallRule(params, raw)
    if (!result.ok) return fail(res, 422, result.message)
    auditService.record('firewall.delete-rule', `asset=${assetId}`, raw)
    ok(res, result)
  } catch (e) {
    logFirewallError('delete-rule', assetId, e)
    fail(res, 502, '删除规则失败：SSH 连接或命令执行出错')
  }
}))
