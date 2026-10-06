import { Router, type Request } from 'express'
import { asyncHandler, ok, fail } from '../utils/response'
import { requireUser, requireAdmin } from '../services/authService'
import { credentialService, type CreateCredentialInput } from '../services/credentialService'
import { paginate } from '../utils/paginate'
import { auditService } from '../services/auditService'

export const credentialsRouter = Router()

const KINDS = new Set(['ssh', 'db', 'k8s', 'cloud'])
// 单字段长度上限：kubeconfig 可能较大但也不应无上限地写进 store.json
const NAME_MAX = 100
const KUBECONFIG_MAX = 256 * 1024

/** 入参防呆：kind 枚举、字符串类型与长度上限。超限直接 400，避免垃圾数据永久进入 store。 */
function validate(body: CreateCredentialInput): string | null {
  if (!body?.name || !body?.kind) return 'name 与 kind 必填'
  if (!KINDS.has(body.kind)) return `kind 必须是 ${[...KINDS].join(' / ')} 之一`
  if (typeof body.name !== 'string' || body.name.length > NAME_MAX) return `name 需为不超过 ${NAME_MAX} 字符的字符串`
  if (body.kubeconfig != null && (typeof body.kubeconfig !== 'string' || body.kubeconfig.length > KUBECONFIG_MAX)) {
    return `kubeconfig 过大（上限 ${KUBECONFIG_MAX / 1024}KB）`
  }
  if (body.port != null) {
    const port = Number(body.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535) return 'port 需为 1-65535 的整数'
  }
  return null
}

/** 从 req 上取 requireUser 注入的当前用户（authService 未扩展 Express 类型，这里统一断言）。 */
function actor(req: Request): string {
  return (req as unknown as { user?: { username?: string } }).user?.username || '?'
}

credentialsRouter.get('/', requireUser, requireAdmin, asyncHandler(async (req, res) => {
  ok(res, paginate(credentialService.list(), req.query as Record<string, unknown>))
}))

credentialsRouter.post('/', requireUser, requireAdmin, asyncHandler(async (req, res) => {
  const body = req.body as CreateCredentialInput
  const invalid = validate(body)
  if (invalid) return fail(res, 400, invalid)
  try {
    const created = credentialService.create(body)
    auditService.record('credential.create', actor(req), `新建凭据 ${body.name}（${body.kind}）`)
    ok(res, created)
  } catch (e) {
    // encrypt 抛错（密钥不可用等）到此为 500：凭据绝不能在加密失败时"看似保存成功"
    fail(res, 500, '凭据加密失败，已取消保存', e instanceof Error ? e.message : undefined)
  }
}))

credentialsRouter.put('/:id', requireUser, requireAdmin, asyncHandler(async (req, res) => {
  const body = req.body as CreateCredentialInput
  const invalid = validate(body)
  if (invalid) return fail(res, 400, invalid)
  try {
    const updated = credentialService.update(req.params.id, body)
    if (!updated) return fail(res, 404, 'credential not found')
    auditService.record('credential.update', actor(req), `更新凭据 ${updated.name}`)
    ok(res, updated)
  } catch (e) {
    fail(res, 500, '凭据加密失败，已取消保存', e instanceof Error ? e.message : undefined)
  }
}))

credentialsRouter.delete('/:id', requireUser, requireAdmin, asyncHandler(async (req, res) => {
  const target = credentialService.list().find((c) => c.id === req.params.id)
  const removed = credentialService.remove(req.params.id)
  if (!removed) return fail(res, 404, 'credential not found')
  auditService.record('credential.delete', actor(req), `删除凭据 ${target?.name || req.params.id}`)
  ok(res, { ok: true })
}))
