import { Router } from 'express'
import { asyncHandler, ok, fail } from '../utils/response'
import { credentialService, type CreateCredentialInput } from '../services/credentialService'

export const credentialsRouter = Router()

credentialsRouter.get('/', asyncHandler(async (_req, res) => {
  ok(res, credentialService.list())
}))

credentialsRouter.post('/', asyncHandler(async (req, res) => {
  const body = req.body as CreateCredentialInput
  if (!body?.name || !body?.kind) return fail(res, 400, 'name 与 kind 必填')
  ok(res, credentialService.create(body))
}))

credentialsRouter.delete('/:id', asyncHandler(async (req, res) => {
  const removed = credentialService.remove(req.params.id)
  if (!removed) return fail(res, 404, 'credential not found')
  ok(res, { ok: true })
}))
