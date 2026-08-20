import { Router } from 'express'
import { asyncHandler, ok, fail } from '../utils/response'
import { requireUser } from '../services/authService'
import { credentialService, type CreateCredentialInput } from '../services/credentialService'
import { paginate } from '../utils/paginate'

export const credentialsRouter = Router()

credentialsRouter.get('/', requireUser, asyncHandler(async (req, res) => {
  ok(res, paginate(credentialService.list(), req.query as Record<string, unknown>))
}))

credentialsRouter.post('/', requireUser, asyncHandler(async (req, res) => {
  const body = req.body as CreateCredentialInput
  if (!body?.name || !body?.kind) return fail(res, 400, 'name 与 kind 必填')
  ok(res, credentialService.create(body))
}))

credentialsRouter.put('/:id', requireUser, asyncHandler(async (req, res) => {
  const updated = credentialService.update(req.params.id, req.body as CreateCredentialInput)
  if (!updated) return fail(res, 404, 'credential not found')
  ok(res, updated)
}))

credentialsRouter.delete('/:id', requireUser, asyncHandler(async (req, res) => {
  const removed = credentialService.remove(req.params.id)
  if (!removed) return fail(res, 404, 'credential not found')
  ok(res, { ok: true })
}))
