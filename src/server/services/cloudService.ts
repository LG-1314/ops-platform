import crypto from 'node:crypto'
import type { CloudAccount, CloudChangeLog, CloudResource } from '@shared/types'
import { credentialService } from './credentialService'

function sha256hex(s: string | Buffer): string {
  return crypto.createHash('sha256').update(s).digest('hex')
}
function hmac(key: string | Buffer, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data).digest()
}
function hmac1(key: string | Buffer, data: string): Buffer {
  return crypto.createHmac('sha1', key).update(data).digest()
}
function b64(buf: Buffer): string {
  return buf.toString('base64')
}

/** 腾讯云 TC3-HMAC-SHA256 签名请求。 */
async function tencentRequest(
  service: string,
  action: string,
  version: string,
  region: string,
  secretId: string,
  secretKey: string,
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const host = `${service}.tencentcloudapi.com`
  const payload = JSON.stringify({ Action: action, Version: version, Region: region, ...params })
  const timestamp = Math.floor(Date.now() / 1000)
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
  const hashedPayload = sha256hex(payload)
  const signedHeaders = 'content-type;host;x-tc-action;x-tc-timestamp'
  const canonicalHeaders =
    `content-type:application/json; charset=utf-8\nhost:${host}\n` +
    `x-tc-action:${action.toLowerCase()}\nx-tc-timestamp:${timestamp}\n`
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${hashedPayload}`
  const credentialScope = `${date}/${service}/tc3_request`
  const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${sha256hex(canonicalRequest)}`
  const secretDate = hmac(`TC3${secretKey}`, date)
  const secretService = hmac(secretDate, service)
  const secretSigning = hmac(secretService, 'tc3_request')
  const signature = b64(hmac(secretSigning, stringToSign))
  const authorization = `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const res = await fetch(`https://${host}`, {
    method: 'POST',
    signal: AbortSignal.timeout(10000), // 云 API 挂起时不得无限占用路由
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Host: host,
      'X-TC-Action': action,
      'X-TC-Version': version,
      'X-TC-Region': region,
      'X-TC-Timestamp': String(timestamp),
      Authorization: authorization,
    },
    body: payload,
  })
  const json = (await res.json()) as { Response?: Record<string, unknown> & { Error?: { Code: string; Message: string } } }
  if (json.Response?.Error) {
    throw new Error(`${json.Response.Error.Code}: ${json.Response.Error.Message}`)
  }
  return json.Response ?? {}
}

/** 阿里云 HMAC-SHA1 签名请求（老 ROS 风格）。 */
async function aliRequest(
  action: string,
  region: string,
  accessKeyId: string,
  secret: string,
  params: Record<string, string> = {}
): Promise<Record<string, unknown>> {
  const par: Record<string, string> = {
    Action: action,
    Format: 'JSON',
    Version: '2014-05-26',
    AccessKeyId: accessKeyId,
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: crypto.randomUUID(),
    SignatureVersion: '1.0',
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    RegionId: region,
    ...params,
  }
  const keys = Object.keys(par).sort()
  const canonical = keys.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(par[k])}`).join('&')
  const stringToSign = `GET&${encodeURIComponent('/')}&${encodeURIComponent(canonical)}`
  const signature = b64(hmac1(`${secret}&`, stringToSign))
  par.Signature = signature
  const qs = new URLSearchParams(par).toString()
  const res = await fetch(`https://ecs.aliyuncs.com/?${qs}`, { signal: AbortSignal.timeout(10000) })
  const json = (await res.json()) as Record<string, unknown> & { Code?: string; Message?: string }
  if (json.Code && json.Code !== '200') {
    throw new Error(`${json.Code}: ${json.Message ?? ''}`)
  }
  return json
}

/** 按规格粗略估算月度费用（元/月）：基础成本 + CPU/内存线性叠加，仅用于账单概览参考。 */
export function estimateMonthlyCost(cpuCores: number, memoryGB: number): number {
  if (!cpuCores && !memoryGB) return 0
  const v = Math.round(20 + cpuCores * 18 + memoryGB * 8)
  return v > 0 ? v : 0
}

/** 资源快照 diff：返回新增/下线/变化（状态或规格变动）明细，用于变更日志。 */
export function diffResources(
  prev: CloudResource[],
  next: CloudResource[],
  accountId: string,
  accountName: string,
  genId: () => string,
  now = new Date().toISOString(),
): CloudChangeLog[] {
  const prevMap = new Map(prev.map((r) => [r.id, r]))
  const nextMap = new Map(next.map((r) => [r.id, r]))
  const out: CloudChangeLog[] = []
  for (const r of next) {
    const p = prevMap.get(r.id)
    if (!p) {
      out.push({ id: genId(), accountId, accountName, resourceId: r.id, resourceName: r.name, changeType: 'add', detail: `新实例 ${r.type}（${r.region}）`, at: now })
      continue
    }
    if (p.status !== r.status || p.extra?.CPU !== r.extra?.CPU || p.extra?.Memory !== r.extra?.Memory) {
      const parts: string[] = []
      if (p.status !== r.status) parts.push(`状态 ${p.status} → ${r.status}`)
      if (p.extra?.CPU !== r.extra?.CPU || p.extra?.Memory !== r.extra?.Memory) {
        parts.push(`规格 ${p.extra?.CPU || '?'}核/${p.extra?.Memory || '?'}GB → ${r.extra?.CPU || '?'}核/${r.extra?.Memory || '?'}GB`)
      }
      out.push({ id: genId(), accountId, accountName, resourceId: r.id, resourceName: r.name, changeType: 'change', detail: parts.join('；'), at: now })
    }
  }
  for (const p of prev) {
    if (!nextMap.has(p.id)) {
      out.push({ id: genId(), accountId, accountName, resourceId: p.id, resourceName: p.name, changeType: 'remove', detail: `实例已下线（原状态 ${p.status}）`, at: now })
    }
  }
  return out
}

/** 列出云账号下的计算实例资源；无凭据或签名失败均抛出清晰错误。 */
export async function listResources(account: CloudAccount): Promise<CloudResource[]> {
  if (!account.credentialId) throw new Error('未配置云凭据')
  const secret = credentialService.decrypt(account.credentialId)
  if (!secret) throw new Error('凭据不存在或已被删除')
  const region = account.region || 'ap-guangzhou'

  if (account.provider === 'tencent') {
    // 分页拉全量：此前 Limit:50 写死，实例多于 50 台时"消失"的实例会被 diff
    // 判定为已下线，产生虚假 remove 变更日志并污染快照。
    const all: Record<string, unknown>[] = []
    let offset = 0
    for (;;) {
      const resp = await tencentRequest(
        'cvm',
        'DescribeInstances',
        '2017-03-12',
        region,
        secret.accessKey ?? '',
        secret.secretKey ?? '',
        { Limit: 100, Offset: offset }
      )
      const list = (resp.InstanceSet as Record<string, unknown>[]) || []
      all.push(...list)
      const total = Number(resp.TotalCount ?? 0)
      offset += list.length
      if (list.length === 0 || offset >= total || offset > 5000) break
    }
    return all.map((it) => {
      const cpu = Number(it.CPU ?? 0) || 0
      const mem = Number(it.Memory ?? 0) || 0
      // 腾讯云 ExpiredTime 为 unix 秒；按量计费实例无到期时间
      const expiredAtSec = Number(it.ExpiredTime ?? 0)
      return {
        id: String(it.InstanceId),
        name: String(it.InstanceName || it.InstanceId),
        type: 'CVM',
        region: String((it.Placement as Record<string, unknown>)?.Zone ?? region),
        zone: String((it.Placement as Record<string, unknown>)?.Zone ?? ''),
        status: String(it.InstanceState ?? 'Unknown'),
        extra: { CPU: String(it.CPU ?? ''), Memory: String(it.Memory ?? '') },
        monthlyCost: estimateMonthlyCost(cpu, mem),
        expireAt: expiredAtSec > 0 ? new Date(expiredAtSec * 1000).toISOString() : undefined,
      }
    })
  }

  if (account.provider === 'aliyun') {
    // 分页拉全量：DescribeInstances 默认只返回 10 条（PageSize 缺省），
    // 不分页会让第 11 台起的实例每次同步都被误判为"已下线"。
    const all: Record<string, unknown>[] = []
    let pageNumber = 1
    for (;;) {
      const resp = await aliRequest('DescribeInstances', region, secret.accessKey ?? '', secret.secretKey ?? '', {
        PageSize: '100',
        PageNumber: String(pageNumber),
      })
      const inner = resp.Instances as Record<string, unknown> & { Instance?: Record<string, unknown>[] }
      const list = inner?.Instance || []
      all.push(...list)
      const total = Number(resp.TotalCount ?? 0)
      pageNumber += 1
      if (list.length === 0 || all.length >= total || pageNumber > 50) break
    }
    return all.map((it) => {
      const cpu = Number(it.Cpu ?? 0) || 0
      const mem = Number(it.Memory ?? 0) || 0
      // 阿里云 ExpiredTime 为 ISO 字符串；按量计费为空
      const rawExpire = String(it.ExpiredTime ?? '')
      const expireAt = rawExpire && !Number.isNaN(new Date(rawExpire).getTime()) ? new Date(rawExpire).toISOString() : undefined
      return {
        id: String(it.InstanceId),
        name: String(it.InstanceName || it.InstanceId),
        type: 'ECS',
        region,
        zone: String(it.ZoneId ?? ''),
        status: String(it.Status ?? 'Unknown'),
        extra: { CPU: String(it.Cpu ?? ''), Memory: String(it.Memory ?? '') },
        monthlyCost: estimateMonthlyCost(cpu, mem),
        expireAt,
      }
    })
  }

  throw new Error('不支持的云厂商')
}
