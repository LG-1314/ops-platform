import { Router } from 'express'
import { asyncHandler, ok, fail } from '../utils/response'
import { collectMetrics } from '../services/sshService'
import { credentialService } from '../services/credentialService'

export const sshRouter = Router()

// 一次性采集主机指标（CPU/内存/磁盘/负载），经 SSH 连接目标主机执行命令。
sshRouter.post('/collect', asyncHandler(async (req, res) => {
  const { host, port, credentialId } = req.body as {
    host?: string
    port?: number
    credentialId?: string
  }
  if (!host) return fail(res, 400, 'host 必填')
  const secret = credentialId ? credentialService.decrypt(credentialId) : undefined
  if (credentialId && !secret) return fail(res, 404, '凭据不存在或已被删除')
  try {
    const sample = await collectMetrics({
      host,
      port,
      username: secret?.username,
      password: secret?.password,
      privateKey: secret?.privateKey,
    })
    ok(res, sample)
  } catch (e) {
    fail(res, 502, (e as Error).message)
  }
}))
