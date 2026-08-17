import crypto from 'node:crypto'
import type { CloudAccount, CloudResource } from '@shared/types'
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
  const res = await fetch(`https://ecs.aliyuncs.com/?${qs}`)
  const json = (await res.json()) as Record<string, unknown> & { Code?: string; Message?: string }
  if (json.Code && json.Code !== '200') {
    throw new Error(`${json.Code}: ${json.Message ?? ''}`)
  }
  return json
}

/** 列出云账号下的计算实例资源；无凭据或签名失败均抛出清晰错误。 */
export async function listResources(account: CloudAccount): Promise<CloudResource[]> {
  if (!account.credentialId) throw new Error('未配置云凭据')
  const secret = credentialService.decrypt(account.credentialId)
  if (!secret) throw new Error('凭据不存在或已被删除')
  const region = account.region || 'ap-guangzhou'

  if (account.provider === 'tencent') {
    const resp = await tencentRequest(
      'cvm',
      'DescribeInstances',
      '2017-03-12',
      region,
      secret.accessKey ?? '',
      secret.secretKey ?? '',
      { Limit: 50 }
    )
    const list = (resp.InstanceSet as Record<string, unknown>[]) || []
    return list.map((it) => ({
      id: String(it.InstanceId),
      name: String(it.InstanceName || it.InstanceId),
      type: 'CVM',
      region: String((it.Placement as Record<string, unknown>)?.Zone ?? region),
      zone: String((it.Placement as Record<string, unknown>)?.Zone ?? ''),
      status: String(it.InstanceState ?? 'Unknown'),
      extra: { CPU: String(it.CPU ?? ''), Memory: String(it.Memory ?? '') },
    }))
  }

  if (account.provider === 'aliyun') {
    const resp = await aliRequest('DescribeInstances', region, secret.accessKey ?? '', secret.secretKey ?? '')
    const list = (resp.Instances as Record<string, unknown> & { Instance?: Record<string, unknown>[] })?.Instance || []
    return list.map((it) => ({
      id: String(it.InstanceId),
      name: String(it.InstanceName || it.InstanceId),
      type: 'ECS',
      region,
      zone: String(it.ZoneId ?? ''),
      status: String(it.Status ?? 'Unknown'),
      extra: { CPU: String(it.Cpu ?? ''), Memory: String(it.Memory ?? '') },
    }))
  }

  throw new Error('不支持的云厂商')
}
