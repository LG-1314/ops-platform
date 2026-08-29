import { Router } from 'express'
import { asyncHandler, ok, fail } from '../utils/response'
import { requireUser, requireAdmin } from '../services/authService'
import { collectMetrics, collectServices } from '../services/sshService'
import { credentialService } from '../services/credentialService'
import { logger } from '../utils/logger'
import { markAssetCollectionSuccess, markAssetConnectionFailure } from '../services/assetHealthService'

export const sshRouter = Router()

// 一次性采集主机指标（CPU/内存/磁盘/负载），经 SSH 连接目标主机执行命令。
sshRouter.post('/collect', requireUser, requireAdmin, asyncHandler(async (req, res) => {
  const { host, port, credentialId, assetId } = req.body as {
    host?: string
    port?: number
    credentialId?: string
    assetId?: string
  }
  if (!host) return fail(res, 400, 'host 必填')
  const secret = credentialId ? credentialService.decrypt(credentialId) : undefined
  if (credentialId && !secret) return fail(res, 404, '凭据不存在或已被删除')
  if (!secret?.username) return fail(res, 400, '未配置 SSH 凭据：请先在资产/凭据管理中关联该主机的 SSH 账号')
  try {
    const sample = await collectMetrics({
      host,
      port,
      username: secret?.username,
      password: secret?.password,
      privateKey: secret?.privateKey,
    }, assetId)
    if (assetId) markAssetCollectionSuccess(assetId, sample)
    ok(res, sample)
  } catch (e) {
    logger.error(`[ssh] collect failed: ${e instanceof Error ? e.stack || e.message : String(e)}`)
    const msg = (e as Error).message || ''
    // 向调用方透传关键失败原因（认证/网络/命令），便于前端给出可操作提示
    const detail = msg.includes('Authentication')
      ? 'SSH 认证失败：用户名 / 密码 / 私钥不正确'
      : msg.includes('timed out') || msg.includes('timeout')
        ? 'SSH 连接超时：目标主机不可达或防火墙拦截 22 端口'
      : msg.includes('ENOTFOUND') || msg.includes('EAI_AGAIN') || msg.includes('ECONNREFUSED')
        ? '主机不可达 / 22 端口未开放'
      : msg
    if (assetId) markAssetConnectionFailure(assetId, detail || 'SSH 采集失败')
    fail(res, 502, 'SSH 采集失败，请检查主机 / 凭据 / 网络', detail)
  }
}))

// 服务检查：列出目标主机运行中的 systemd 服务（支持按名称过滤）
sshRouter.post('/services', requireUser, requireAdmin, asyncHandler(async (req, res) => {
  const { host, port, credentialId, name } = req.body as {
    host?: string
    port?: number
    credentialId?: string
    name?: string
  }
  if (!host) return fail(res, 400, 'host 必填')
  const secret = credentialId ? credentialService.decrypt(credentialId) : undefined
  if (!secret?.username) return fail(res, 400, '未配置 SSH 凭据：请先关联该主机的 SSH 账号')
  try {
    const services = await collectServices(
      { host, port, username: secret.username, password: secret.password, privateKey: secret.privateKey },
      name?.trim() || undefined
    )
    ok(res, services)
  } catch (e) {
    logger.error(`[ssh] services failed: ${e instanceof Error ? e.message : String(e)}`)
    fail(res, 502, '服务检查失败，请检查主机 / 凭据 / 网络', (e as Error).message)
  }
}))
