import { memoryStore } from '../store/memoryStore'
import { encrypt, decrypt } from '../utils/crypto'
import crypto from 'node:crypto'
import type { Alert, NotificationChannel, NotificationChannelType } from '@shared/types'

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

/** 对外脱敏：剥离 secret / smtpPassword 明文及其密文，前端/列表永不见敏感值。 */
function mask(c: NotificationChannel): NotificationChannel {
  const { secret, secretEnc, smtpPassword, smtpPasswordEnc, ...rest } = c
  void secret
  void secretEnc
  void smtpPassword
  void smtpPasswordEnc
  return { ...rest }
}

function buildText(alert: Alert): string {
  return `[运维告警 ${alert.level}] ${alert.title}\n${alert.message}\n时间：${alert.createdAt}`
}

const LEVEL_COLOR: Record<string, string> = {
  P0: '#F87171',
  P1: '#F59E0B',
  P2: '#22D3EE',
  P3: '#9E9E9E',
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 邮件 HTML 模板：级别色块标题 + 逐行消息 + 时间，纯文本为后备。 */
function buildHtml(alert: Alert): string {
  const color = LEVEL_COLOR[alert.level] || '#3D7BFF'
  const bodyRows = alert.message
    .split('\n')
    .map((l) => `<tr><td style="padding:6px 0;color:#D8E0F0;line-height:1.6">${escapeHtml(l)}</td></tr>`)
    .join('')
  return `<!DOCTYPE html><html><body style="margin:0;background:#0B0E14;font-family:-apple-system,'Segoe UI',Roboto,'PingFang SC','Microsoft YaHei',sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="border:1px solid #242b3a;border-radius:8px;overflow:hidden;background:#141923">
      <div style="padding:16px 20px;border-bottom:1px solid #242b3a">
        <span style="display:inline-block;background:${color};color:#0B0E14;font-weight:700;font-size:13px;padding:2px 10px;border-radius:999px">${escapeHtml(alert.level)}</span>
        <span style="margin-left:10px;color:#E5EAF5;font-weight:600;font-size:15px">${escapeHtml(alert.title)}</span>
      </div>
      <div style="padding:12px 20px">
        <table style="width:100%;border-collapse:collapse">${bodyRows}</table>
      </div>
      <div style="padding:10px 20px;border-top:1px solid #242b3a;color:#9AA7C7;font-size:12px">时间：${escapeHtml(alert.createdAt)}</div>
    </div>
    <div style="color:#5b6478;font-size:11px;margin-top:12px;text-align:center">由 ops-platform 运维平台自动发送</div>
  </div>
</body></html>`
}

/** 邮件发送（SMTP，经 nodemailer 懒加载）。失败仅返回 false，绝不抛出。 */
async function sendEmail(
  channel: NotificationChannel,
  text: string,
  html: string,
  subject?: string
): Promise<boolean> {
  if (!channel.smtpHost || !channel.smtpUser || !channel.smtpTo) return false
  const to = channel.smtpTo.split(',').map((s) => s.trim()).filter(Boolean)
  if (to.length === 0) return false
  try {
    const nodemailer = await import('nodemailer')
    const password = channel.smtpPasswordEnc ? decrypt(channel.smtpPasswordEnc) : undefined
    const secure = channel.smtpSecure ?? true // true=SSL/TLS(465)，false=STARTTLS(587)
    const transporter = nodemailer.createTransport({
      host: channel.smtpHost,
      port: channel.smtpPort || (secure ? 465 : 587),
      secure,
      auth: { user: channel.smtpUser, pass: password },
      connectionTimeout: 8000,
      socketTimeout: 8000,
    })
    await transporter.sendMail({
      from: channel.smtpFrom || channel.smtpUser,
      to: to.join(', '),
      subject: subject || `[运维告警] ${text.split('\n')[0]}`,
      text,
      html,
    })
    return true
  } catch {
    return false
  }
}

/** 飞书机器人加签：timestamp + "\n" + secret 作为 HMAC-SHA256 密钥，对空消息签名后 base64+URL 编码 */
function feishuSign(secret: string, timestampSec: number): string {
  const stringToSign = `${timestampSec}\n${secret}`
  const hmac = crypto.createHmac('sha256', stringToSign).digest('base64')
  return encodeURIComponent(hmac)
}

/** 钉钉机器人加签：以 secret 为密钥对 timestamp + "\n" + secret 做 HMAC-SHA256，base64+URL 编码 */
function dingtalkSign(secret: string, timestampMs: number): string {
  const stringToSign = `${timestampMs}\n${secret}`
  const hmac = crypto.createHmac('sha256', secret).update(stringToSign).digest('base64')
  return encodeURIComponent(hmac)
}

/** 向单个非邮件渠道发送；失败仅返回 false，绝不抛出。 */
async function sendOne(channel: NotificationChannel, text: string): Promise<boolean> {
  if (!channel.url) return false
  let payload: unknown
  let url = channel.url
  // 飞书 / 钉钉 自定义机器人若配置了签名密钥，则追加时间戳 + 签名（真实加签，非占位）
  const secret = channel.secretEnc ? decrypt(channel.secretEnc) : ''
  if (channel.type === 'feishu') {
    payload = { msg_type: 'text', content: { text } }
    if (secret) {
      const timestamp = Math.floor(Date.now() / 1000)
      const sign = feishuSign(secret, timestamp)
      url = `${url}${url.includes('?') ? '&' : '?'}timestamp=${timestamp}&sign=${sign}`
    }
  } else if (channel.type === 'dingtalk') {
    payload = { msgtype: 'text', text: { content: text } }
    if (secret) {
      const timestamp = Date.now()
      const sign = dingtalkSign(secret, timestamp)
      url = `${url}${url.includes('?') ? '&' : '?'}timestamp=${timestamp}&sign=${sign}`
    }
  } else {
    payload = { text, title: '[运维告警]', level: 'info' }
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    })
    return res.ok
  } catch {
    return false
  }
}

export const notificationService = {
  list(): NotificationChannel[] {
    return memoryStore.getNotificationChannels().map(mask)
  },

  create(input: Partial<NotificationChannel>): NotificationChannel {
    if (!input?.name || !input?.type) throw new Error('name 与 type 必填')
    const c: NotificationChannel = {
      id: genId('chan'),
      name: input.name,
      type: (input.type as NotificationChannelType) || 'webhook',
      enabled: input.enabled ?? true,
      url: input.url,
      secretEnc: input.secret ? encrypt(input.secret) : undefined,
      smtpHost: input.smtpHost,
      smtpPort: input.smtpPort,
      smtpSecure: input.smtpSecure,
      smtpUser: input.smtpUser,
      smtpPasswordEnc: input.smtpPassword ? encrypt(input.smtpPassword) : undefined,
      smtpFrom: input.smtpFrom,
      smtpTo: input.smtpTo,
      createdAt: new Date().toISOString(),
    }
    return mask(memoryStore.addNotificationChannel(c))
  },

  update(id: string, input: Partial<NotificationChannel>): NotificationChannel | undefined {
    const patch: Partial<NotificationChannel> = {}
    if (input.name !== undefined) patch.name = input.name
    if (input.type !== undefined) patch.type = input.type
    if (input.enabled !== undefined) patch.enabled = input.enabled
    if (input.url !== undefined) patch.url = input.url
    // 敏感字段：非空则加密替换；空串/缺省则保留原值（前端「密码留空=保留」约定）
    if (input.secret) patch.secretEnc = encrypt(input.secret)
    if (input.smtpPassword) patch.smtpPasswordEnc = encrypt(input.smtpPassword)
    if (input.smtpHost !== undefined) patch.smtpHost = input.smtpHost
    if (input.smtpPort !== undefined) patch.smtpPort = input.smtpPort
    if (input.smtpSecure !== undefined) patch.smtpSecure = input.smtpSecure
    if (input.smtpUser !== undefined) patch.smtpUser = input.smtpUser
    if (input.smtpFrom !== undefined) patch.smtpFrom = input.smtpFrom
    if (input.smtpTo !== undefined) patch.smtpTo = input.smtpTo
    const updated = memoryStore.updateNotificationChannel(id, patch)
    return updated ? mask(updated) : undefined
  },

  remove(id: string): boolean {
    return memoryStore.removeNotificationChannel(id)
  },

  /** 告警生成后调用：向所有启用渠道推送；应用内（inapp）无需外部发送。 */
  async notify(alert: Alert): Promise<number> {
    const channels = memoryStore.getNotificationChannels().filter((c) => c.enabled && c.type !== 'inapp')
    if (channels.length === 0) return 0
    const text = buildText(alert)
    const html = buildHtml(alert)
    const subject = `[运维告警 ${alert.level}] ${alert.title}`
    let sent = 0
    await Promise.all(
      channels.map(async (c) => {
        const ok = c.type === 'email' ? await sendEmail(c, text, html, subject) : await sendOne(c, text)
        if (ok) sent += 1
      })
    )
    return sent
  },

  /** 连通性测试：对某渠道发一条测试消息；email 走 SMTP，其余走 webhook/机器人。 */
  async test(id: string): Promise<{ ok: boolean; message: string }> {
    const c = memoryStore.getNotificationChannels().find((x) => x.id === id)
    if (!c) return { ok: false, message: '渠道不存在' }
    if (c.type === 'inapp') return { ok: true, message: '应用内通知无需测试' }
    const text = '[测试] 运维告警通知渠道连通性测试\n这是一条自动发送的测试消息。'
    const html = `<p style="color:#D8E0F0">[测试] 运维告警通知渠道连通性测试</p>`
    const ok = c.type === 'email'
      ? await sendEmail(c, text, html, '[测试] 运维告警通知渠道')
      : await sendOne(c, text)
    return ok
      ? { ok: true, message: '测试发送成功' }
      : { ok: false, message: '测试发送失败，请检查渠道配置' }
  },
}
