import { memoryStore } from '../store/memoryStore'
import { encrypt, decrypt } from '../utils/crypto'
import type { Credential, CredentialKind } from '@shared/types'

export interface CreateCredentialInput {
  name: string
  kind: CredentialKind
  host?: string
  port?: number
  username?: string
  database?: string
  dbType?: 'mysql' | 'postgres' | 'redis'
  provider?: 'tencent' | 'aliyun'
  region?: string
  endpoint?: string
  // 明文敏感字段（服务端加密后存储，绝不明文落盘）
  password?: string
  privateKey?: string
  secretKey?: string
  accessKey?: string
  token?: string
  kubeconfig?: string
}

/** 解密后的敏感字段，仅供连接器在内存中使用。 */
export interface DecryptedSecret {
  username?: string
  password?: string
  privateKey?: string
  secretKey?: string
  accessKey?: string
  token?: string
  kubeconfig?: string
}

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

/** 去除所有敏感字段，用于对外返回（列表/详情接口）。 */
function mask(c: Credential): Credential {
  const { passwordEnc, privateKeyEnc, secretKeyEnc, accessKeyEnc, tokenEnc, kubeconfigEnc, ...rest } = c
  void passwordEnc
  void privateKeyEnc
  void secretKeyEnc
  void accessKeyEnc
  void tokenEnc
  void kubeconfigEnc
  return { ...rest }
}

export const credentialService = {
  list(): Credential[] {
    return memoryStore.getCredentials().map(mask)
  },

  get(id: string): Credential | undefined {
    const c = memoryStore.getCredentials().find((x) => x.id === id)
    return c ? mask(c) : undefined
  },

  create(input: CreateCredentialInput): Credential {
    const now = new Date().toISOString()
    const cred: Credential = {
      id: genId('cred'),
      name: input.name,
      kind: input.kind,
      createdAt: now,
      host: input.host,
      port: input.port,
      username: input.username,
      database: input.database,
      dbType: input.dbType,
      provider: input.provider,
      region: input.region,
      endpoint: input.endpoint,
    }
    if (input.password) cred.passwordEnc = encrypt(input.password)
    if (input.privateKey) cred.privateKeyEnc = encrypt(input.privateKey)
    if (input.secretKey) cred.secretKeyEnc = encrypt(input.secretKey)
    if (input.accessKey) cred.accessKeyEnc = encrypt(input.accessKey)
    if (input.token) cred.tokenEnc = encrypt(input.token)
    if (input.kubeconfig) cred.kubeconfigEnc = encrypt(input.kubeconfig)
    return mask(memoryStore.addCredential(cred))
  },

  update(id: string, input: Partial<CreateCredentialInput>): Credential | undefined {
    const patch: Partial<Credential> = {}
    const scalarKeys: (keyof CreateCredentialInput)[] = [
      'name', 'kind', 'host', 'port', 'username', 'database', 'dbType', 'provider', 'region', 'endpoint',
    ]
    for (const k of scalarKeys) {
      if (input[k] !== undefined) (patch as Record<string, unknown>)[k] = input[k]
    }
    if (input.password) patch.passwordEnc = encrypt(input.password)
    if (input.privateKey) patch.privateKeyEnc = encrypt(input.privateKey)
    if (input.secretKey) patch.secretKeyEnc = encrypt(input.secretKey)
    if (input.accessKey) patch.accessKeyEnc = encrypt(input.accessKey)
    if (input.token) patch.tokenEnc = encrypt(input.token)
    if (input.kubeconfig) patch.kubeconfigEnc = encrypt(input.kubeconfig)
    const updated = memoryStore.updateCredential(id, patch)
    return updated ? mask(updated) : undefined
  },

  remove(id: string): boolean {
    return memoryStore.removeCredential(id)
  },

  /** 解密凭据敏感字段，供连接器建立连接使用（绝不通过 API 外泄）。 */
  decrypt(id: string): DecryptedSecret | undefined {
    const c = memoryStore.getCredentials().find((x) => x.id === id)
    if (!c) return undefined
    return {
      username: c.username,
      password: c.passwordEnc ? decrypt(c.passwordEnc) : undefined,
      privateKey: c.privateKeyEnc ? decrypt(c.privateKeyEnc) : undefined,
      secretKey: c.secretKeyEnc ? decrypt(c.secretKeyEnc) : undefined,
      accessKey: c.accessKeyEnc ? decrypt(c.accessKeyEnc) : undefined,
      token: c.tokenEnc ? decrypt(c.tokenEnc) : undefined,
      kubeconfig: c.kubeconfigEnc ? decrypt(c.kubeconfigEnc) : undefined,
    }
  },
}
