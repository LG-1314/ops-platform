import crypto from 'node:crypto'
import { readJSONFile, writeJSONAtomic } from '../store/persist'

// SSH 主机密钥指纹存储（TOFU：Trust On First Use）。
// 首次连接记录 `user@host:port` 的公钥指纹；之后每次连接必须匹配，
// 不一致判定为中间人风险并拒绝连接。与 ssh2 的 hostVerifier 配合使用。
const FILE = 'host-keys.json'

const fingerprints: Map<string, string> = new Map(
  Object.entries((readJSONFile(FILE) as Record<string, string> | null) || {})
)

function keyOf(host: string, port: number | undefined, username?: string): string {
  return `${username ?? ''}@${host}:${port || 22}`
}

/** 计算主机公钥指纹（sha256，base64，与 OpenSSH SHA256 指纹同一算法）。 */
export function fingerprintOf(key: Buffer): string {
  return crypto.createHash('sha256').update(key).digest('base64')
}

/** 校验并登记主机指纹。返回 null 表示通过（首次自动信任或指纹匹配）；
 *  返回字符串为拒绝原因（指纹不匹配，疑似中间人）。 */
export function verifyHostKey(host: string, port: number | undefined, username: string | undefined, key: Buffer): string | null {
  const k = keyOf(host, port, username)
  const fp = fingerprintOf(key)
  const known = fingerprints.get(k)
  if (!known) {
    fingerprints.set(k, fp)
    persist()
    return null
  }
  if (known === fp) return null
  return (
    'SSH 主机密钥校验失败：服务器指纹与首次连接时的记录不一致，' +
    '可能存在中间人风险或服务器重装。如确认服务器变更属预期，请到数据目录删除 host-keys.json 中对应条目后重试。'
  )
}

function persist(): void {
  writeJSONAtomic(FILE, Object.fromEntries(fingerprints))
}
