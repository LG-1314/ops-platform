import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// 凭据加密：AES-256-GCM。密钥仅存于本机用户目录（userData / ~/.ops-platform），
// 绝不随代码或配置外发；敏感字段在落盘前加密为 base64(iv|tag|ciphertext)。
const ALGO = 'aes-256-gcm'
const KEY_FILE = 'ops-key.json'

/** 不可逆解密失败时抛出，便于上层区分「无值」与「解密失败」。 */
export class DecryptError extends Error {
  constructor(msg: string) {
    super(msg)
    this.name = 'DecryptError'
  }
}

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
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed.key === 'string' && parsed.key) {
        cachedKey = Buffer.from(parsed.key, 'base64')
        return cachedKey
      }
    } catch {
      // 落盘密钥损坏则重新生成（旧密文将不可恢复，属数据丢失，需提示）
    }
  }
  const k = crypto.randomBytes(32)
  try {
    fs.writeFileSync(p, JSON.stringify({ key: k.toString('base64') }), { mode: 0o600 })
  } catch (e) {
    // 密钥写盘失败属严重问题：密文将随进程重启无法解密。
    // 不允许静默忽略——记录错误并抛出，阻断依赖加密的写操作，避免"看似成功实则凭据已废"。
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`凭据加密密钥写盘失败，已停止加密写入以防止凭据不可逆丢失：${msg}`)
  }
  cachedKey = k
  return cachedKey
}

/** 加密明文字符串，返回 base64(iv|tag|cipher)。空串直接返回空。
 *  加密失败必须抛错而非返回空串：调用方会把返回值当密文落盘，静默空串等于
 *  无声销毁凭据（比如密钥读取瞬时异常时把真实密码覆盖成 ''）。 */
export function encrypt(plain: string): string {
  if (!plain) return ''
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

/** 解密 base64(iv|tag|cipher) 回明文；密文损坏/key 不符抛 DecryptError（不再静默返回空）。 */
export function decrypt(b64: string): string {
  if (!b64) return ''
  try {
    const buf = Buffer.from(b64, 'base64')
    if (buf.length < 28) throw new DecryptError('密文长度不足')
    const iv = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const enc = buf.subarray(28)
    const decipher = crypto.createDecipheriv(ALGO, getKey(), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
  } catch (e) {
    if (e instanceof DecryptError) throw e
    throw new DecryptError(`解密失败（key 不匹配或密文损坏）：${e instanceof Error ? e.message : String(e)}`)
  }
}
