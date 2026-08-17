import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// 凭据加密：AES-256-GCM。密钥仅存于本机用户目录（userData / ~/.ops-platform），
// 绝不随代码或配置外发；敏感字段在落盘前加密为 base64(iv|tag|ciphertext)。
const ALGO = 'aes-256-gcm'
const KEY_FILE = 'ops-key.json'

function dataDir(): string {
  const d = process.env.OPS_DATA_DIR || path.join(os.homedir(), '.ops-platform')
  try {
    fs.mkdirSync(d, { recursive: true })
  } catch {
    /* ignore */
  }
  return d
}

let cachedKey: Buffer | null = null
function getKey(): Buffer {
  if (cachedKey) return cachedKey
  const p = path.join(dataDir(), KEY_FILE)
  if (fs.existsSync(p)) {
    try {
      const raw = fs.readFileSync(p, 'utf8')
      cachedKey = Buffer.from(JSON.parse(raw).key, 'base64')
      return cachedKey
    } catch {
      /* 落盘密钥损坏则重新生成 */
    }
  }
  const k = crypto.randomBytes(32)
  try {
    fs.writeFileSync(p, JSON.stringify({ key: k.toString('base64') }), { mode: 0o600 })
  } catch {
    /* 忽略：密钥仅用于本机会话内加密，写盘失败也不阻断主流程 */
  }
  cachedKey = k
  return cachedKey
}

/** 加密明文字符串，返回 base64(iv|tag|cipher)。空串直接返回空。 */
export function encrypt(plain: string): string {
  if (!plain) return ''
  try {
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv(ALGO, getKey(), iv)
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return Buffer.concat([iv, tag, enc]).toString('base64')
  } catch {
    return ''
  }
}

/** 解密 base64(iv|tag|cipher) 回明文；失败返回空串，绝不让进程崩溃。 */
export function decrypt(b64: string): string {
  if (!b64) return ''
  try {
    const buf = Buffer.from(b64, 'base64')
    const iv = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const enc = buf.subarray(28)
    const decipher = crypto.createDecipheriv(ALGO, getKey(), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
  } catch {
    return ''
  }
}
