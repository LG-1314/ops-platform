import { isIP } from 'node:net'
import type { Asset, AssetSource, AssetType } from '@shared/types'

const ASSET_TYPES: AssetType[] = ['server', 'middleware', 'container', 'database', 'network']
const ASSET_SOURCES: AssetSource[] = ['manual', 'auto', 'agent', 'ssh', 'api']

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** 仅允许 IP、localhost 或符合 DNS 标签规则的域名，避免无效探测目标进入资产台账。 */
export function isValidAssetHost(value: string): boolean {
  const host = value.trim()
  if (!host || host.length > 253 || /\s/.test(host)) return false
  if (isIP(host) !== 0) return true
  if (host === 'localhost') return true

  return host.split('.').every((label) =>
    /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label)
  )
}

/** 资产录入和更新的服务端校验；前端提示不能替代此处的接口防线。 */
export function validateAssetInput(input: Record<string, unknown>, creating = false): string | null {
  if (!isPlainObject(input)) return '请求数据格式不正确'

  if (creating && (typeof input.name !== 'string' || !input.name.trim())) return '名称为必填项'
  if (input.name !== undefined && (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 100)) {
    return '名称长度需为 1 到 100 个字符'
  }

  if (creating && (typeof input.host !== 'string' || !input.host.trim())) return '主机地址为必填项'
  if (input.host !== undefined && (typeof input.host !== 'string' || !isValidAssetHost(input.host))) {
    return '主机地址格式不正确'
  }

  if (input.ip !== undefined && input.ip !== null && (typeof input.ip !== 'string' || (input.ip.trim() && isIP(input.ip.trim()) === 0))) {
    return 'IP 地址格式不正确'
  }

  if (input.port !== undefined && input.port !== null && (!Number.isInteger(input.port) || (input.port as number) < 1 || (input.port as number) > 65535)) {
    return '端口必须是 1 到 65535 之间的整数'
  }

  if (input.type !== undefined && (typeof input.type !== 'string' || !ASSET_TYPES.includes(input.type as AssetType))) {
    return '资产类型不正确'
  }

  if (input.source !== undefined && (typeof input.source !== 'string' || !ASSET_SOURCES.includes(input.source as AssetSource))) {
    return '资产来源不正确'
  }

  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags) || input.tags.some((tag) => typeof tag !== 'string')) return '标签必须是字符串数组'
    if (input.tags.length > 30 || input.tags.some((tag) => !tag.trim() || tag.trim().length > 32)) return '单个标签不能为空且不得超过 32 个字符，最多 30 个标签'
  }

  if (input.credentialId !== undefined && input.credentialId !== null && (typeof input.credentialId !== 'string' || !input.credentialId.trim())) {
    return '凭据标识不正确'
  }

  return null
}

/** 未保存资产的可达性测试只校验连接所需字段，不强制要求名称和类型。 */
export function validateAssetConnectionTarget(input: Record<string, unknown>): string | null {
  if (!isPlainObject(input) || typeof input.host !== 'string' || !input.host.trim()) return '主机地址为必填项'
  return validateAssetInput(input)
}

/** 仅保留资产录入允许写入的字段，避免客户端修改监控状态等系统字段。 */
export function normalizeAssetInput(input: Record<string, unknown>): Partial<Asset> {
  const result: Partial<Asset> = {}
  if (typeof input.name === 'string') result.name = input.name.trim()
  if (typeof input.type === 'string') result.type = input.type as AssetType
  if (typeof input.host === 'string') result.host = input.host.trim()
  if (typeof input.ip === 'string' || input.ip === null) result.ip = typeof input.ip === 'string' && input.ip.trim() ? input.ip.trim() : undefined
  if (typeof input.port === 'number' || input.port === null) result.port = typeof input.port === 'number' ? input.port : undefined
  if (Array.isArray(input.tags)) result.tags = Array.from(new Set(input.tags.map((tag) => String(tag).trim()).filter(Boolean)))
  if (typeof input.source === 'string') result.source = input.source as AssetSource
  if (typeof input.credentialId === 'string' || input.credentialId === null) result.credentialId = typeof input.credentialId === 'string' && input.credentialId.trim() ? input.credentialId.trim() : undefined
  return result
}
