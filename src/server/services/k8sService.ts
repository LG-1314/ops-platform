import net from 'node:net'
import tls from 'node:tls'
import dns from 'node:dns/promises'
import { URL } from 'node:url'
import type { KubeConfig } from '@kubernetes/client-node'
import type {
  ClusterInfo,
  ClusterDetail,
  ClusterDiagItem,
  ClusterServiceInfo,
  K8sNodeInfo,
  K8sWorkloadInfo,
  Status,
} from '@shared/types'
import { credentialService } from './credentialService'

function buildKc(KubeConfigCls: new (...args: any[]) => KubeConfig, cluster: ClusterInfo, token?: string, kubeconfig?: string): KubeConfig {
  const kc = new KubeConfigCls()
  if (kubeconfig) {
    kc.loadFromString(kubeconfig)
    return kc
  }
  if (token && cluster.endpoint) {
    kc.loadFromOptions({
      clusters: [{ name: 'c', server: cluster.endpoint, skipTLSVerify: true }],
      contexts: [{ name: 'ctx', cluster: 'c', user: 'u' }],
      users: [{ name: 'u', token }],
      currentContext: 'ctx',
    })
    return kc
  }
  throw new Error('未配置集群凭据（token 或 kubeconfig）')
}

// —— 资源量解析（k8s 数值后缀 → 统一数值）——
export function parseCpuQuantity(v?: string): number {
  // 核数：裸数字或 "250m"；metrics 用 "123456n"
  if (!v) return 0
  const m = /^([\d.]+)(n|m|u)?$/.exec(v.trim())
  if (!m) return 0
  const n = Number(m[1])
  if (m[2] === 'n') return n / 1e9
  if (m[2] === 'u') return n / 1e6
  if (m[2] === 'm') return n / 1000
  return n
}
export function parseMemQuantity(v?: string): number {
  // 内存：Ki/Mi/Gi/Ti/K/M/G/B 等后缀 → 字节数
  if (!v) return 0
  const units: Record<string, number> = {
    Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4,
    K: 1e3, M: 1e6, G: 1e9, T: 1e12, B: 1,
  }
  const m = /^([\d.]+)?([A-Za-z]+)?$/.exec(v.trim())
  if (!m) return 0
  const n = m[1] ? Number(m[1]) : 0
  const u = m[2] && units[m[2]] ? units[m[2]] : 1
  return n * u
}

// —— 自检纯函数：endpoint 解析与证书到期判断 ——
export function parseEndpoint(endpoint: string): { host: string; port: number; secure: boolean } | null {
  try {
    const u = new URL(endpoint)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    return { host: u.hostname, port: u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80, secure: u.protocol === 'https:' }
  } catch {
    return null
  }
}
export function certExpiry(validTo: string, now = new Date()): { expired: boolean; daysLeft: number } {
  const t = new Date(validTo).getTime()
  if (Number.isNaN(t)) return { expired: false, daysLeft: Number.NaN }
  const daysLeft = Math.floor((t - now.getTime()) / 86400000)
  return { expired: daysLeft < 0, daysLeft }
}

function tcpProbe(host: string, port: number, timeoutMs = 3000): Promise<string | null> {
  return new Promise((resolve) => {
    const s = net.connect({ host, port })
    const done = (err: string | null) => { s.destroy(); resolve(err) }
    s.setTimeout(timeoutMs, () => done('连接超时'))
    s.on('connect', () => done(null))
    s.on('error', (e) => done(e.message))
  })
}

function tlsCertValidTo(host: string, port: number, timeoutMs = 3000): Promise<{ validTo?: string; error?: string }> {
  return new Promise((resolve) => {
    const s = tls.connect({ host, port, rejectUnauthorized: false, servername: host }, () => {
      const cert = s.getPeerCertificate()
      s.destroy()
      resolve(cert && cert.valid_to ? { validTo: cert.valid_to } : { error: '未获取到服务端证书' })
    })
    s.setTimeout(timeoutMs, () => { s.destroy(); resolve({ error: 'TLS 握手超时' }) })
    s.on('error', (e) => { s.destroy(); resolve({ error: e.message }) })
  })
}

/**
 * 集群连接一键自检：逐项检测 endpoint 格式 / DNS / 端口 / 证书 / 凭据 / API Server，
 * 每项返回 ok + 排查指引文案；任何单项失败都不抛出。
 */
export async function diagnose(cluster: ClusterInfo): Promise<ClusterDiagItem[]> {
  const items: ClusterDiagItem[] = []

  // 1. endpoint 格式
  const ep = parseEndpoint(cluster.endpoint)
  if (!ep) {
    items.push({ item: 'Endpoint 格式', ok: false, detail: `「${cluster.endpoint}」不是合法的 http(s) 地址，请核对 API Server 地址` })
    return items
  }
  items.push({ item: 'Endpoint 格式', ok: true, detail: `地址合法，目标 ${ep.host}:${ep.port}` })

  // 2. DNS 解析
  try {
    const ips = await dns.lookup(ep.host, { all: true })
    items.push({ item: 'DNS 解析', ok: true, detail: `解析到 ${ips.map((i) => i.address).join('、')}` })
  } catch (e) {
    items.push({ item: 'DNS 解析', ok: false, detail: `域名解析失败（${e instanceof Error ? e.message : String(e)}），请检查域名拼写或本机 DNS 配置` })
  }

  // 3. TCP 端口连通
  const tcpErr = await tcpProbe(ep.host, ep.port)
  items.push(
    tcpErr
      ? { item: '端口连通', ok: false, detail: `${ep.host}:${ep.port} 不可达（${tcpErr}），请检查安全组 / 防火墙是否放行，或 kube-apiserver 是否监听该端口` }
      : { item: '端口连通', ok: true, detail: `${ep.host}:${ep.port} 可达` },
  )

  // 4. 证书有效期（仅 https）
  if (ep.secure) {
    const cert = await tlsCertValidTo(ep.host, ep.port)
    if (cert.error) {
      items.push({ item: '服务端证书', ok: false, detail: `TLS 握手失败（${cert.error}），可能端口被非 TLS 服务占用或中间设备拦截` })
    } else if (cert.validTo) {
      const { expired, daysLeft } = certExpiry(cert.validTo)
      items.push(
        expired
          ? { item: '服务端证书', ok: false, detail: `证书已于 ${cert.validTo} 过期，请尽快更换 apiserver 证书` }
          : { item: '服务端证书', ok: true, detail: `证书有效期至 ${cert.validTo}（剩 ${daysLeft} 天）` },
      )
    }
  }

  // 5. 凭据配置
  if (!cluster.credentialId) {
    items.push({ item: '访问凭据', ok: false, detail: '未关联凭据，请编辑集群并绑定 Token / Kubeconfig 凭据' })
  } else {
    const secret = credentialService.decrypt(cluster.credentialId)
    if (!secret) {
      items.push({ item: '访问凭据', ok: false, detail: '关联的凭据不存在或已被删除，请重新绑定' })
    } else {
      items.push({ item: '访问凭据', ok: true, detail: `已关联凭据（${secret.kubeconfig ? 'Kubeconfig' : 'Token'}），已加密存储` })
    }
  }

  // 6. API Server 响应（完整拉取一次详情）
  try {
    await detail(cluster)
    items.push({ item: 'API Server 响应', ok: true, detail: 'API Server 响应正常，可拉取节点与工作负载' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const hint = /凭据|token|401|403/i.test(msg)
      ? '鉴权被拒绝：请确认 Token 未过期、Service Account 具有 list 权限（RBAC）'
      : /ENOTFOUND|ETIMEDOUT|ECONNREFUSED|network/i.test(msg)
        ? '网络层不通：请检查本机到 API Server 的路由 / 代理设置'
        : 'API 调用失败：请结合服务端日志进一步排查（可能是 apiserver 负载或版本兼容问题）'
    items.push({ item: 'API Server 响应', ok: false, detail: `${msg}。${hint}` })
  }

  return items
}

/** metrics-server 可用时拉取各节点 CPU/内存用量；不可用返回空映射（不抛错） */
async function fetchNodeMetrics(kc: KubeConfig): Promise<Record<string, { cpuCores: number; memBytes: number }>> {
  const out: Record<string, { cpuCores: number; memBytes: number }> = {}
  const anyKc = kc as unknown as { applyToFetchOptions?: (init: RequestInit) => Promise<RequestInit> | RequestInit }
  if (typeof anyKc.applyToFetchOptions !== 'function') return out
  try {
    let init = { url: '/apis/metrics.k8s.io/v1beta1/nodes' } as RequestInit & { url?: string }
    init = (await anyKc.applyToFetchOptions(init)) as typeof init
    const base = (kc.getCurrentCluster() || {}).server
    if (!base) return out
    const res = await fetch(new URL(init.url as string, base), init)
    if (!res.ok) return out
    const body = (await res.json()) as {
      items?: Array<{ metadata?: { name?: string }; usage?: { cpu?: string; memory?: string } }>
    }
    for (const it of body.items || []) {
      if (!it.metadata?.name || !it.usage) continue
      out[it.metadata.name] = {
        cpuCores: parseCpuQuantity(it.usage.cpu),
        memBytes: parseMemQuantity(it.usage.memory),
      }
    }
  } catch {
    // metrics-server 不可用属正常场景，静默降级
  }
  return out
}

/** 连接集群并拉取节点/工作负载/服务真实数据；失败抛出清晰错误（路由层转译为可读提示）。 */
export async function detail(cluster: ClusterInfo): Promise<ClusterDetail> {
  // 延迟加载客户端：避免 k8s SDK 及其传递依赖在启动期被静态引入，
  // 即便该连接器在某些运行环境下不可用，也只会影响「集群」功能而非拖垮整个能力总线。
  const { KubeConfig: KubeConfigCls, CoreV1Api: CoreV1ApiCls, AppsV1Api: AppsV1ApiCls } =
    await import('@kubernetes/client-node')
  let secret: ReturnType<typeof credentialService.decrypt> | undefined
  if (cluster.credentialId) {
    secret = credentialService.decrypt(cluster.credentialId)
    if (!secret) throw new Error('凭据不存在或已被删除')
  }
  const kc = buildKc(KubeConfigCls, cluster, secret?.token, secret?.kubeconfig)
  const core = kc.makeApiClient(CoreV1ApiCls)
  const apps = kc.makeApiClient(AppsV1ApiCls)

  const [nodeRes, depRes] = await Promise.all([
    core.listNode(),
    apps.listDeploymentForAllNamespaces(),
  ])

  const nodeCap = new Map<string, { cores: number; bytes: number }>()
  const nodes: K8sNodeInfo[] = (nodeRes.items || []).map((n) => {
    const ready =
      n.status?.conditions?.some((c) => c.type === 'Ready' && c.status === 'True') ?? false
    const role =
      (n.metadata?.labels?.['kubernetes.io/role'] as string) ||
      (n.metadata?.labels?.['node-role.kubernetes.io/control-plane']
        ? 'control-plane'
        : 'worker')
    const status: Status = ready ? 'ok' : 'error'
    const name = n.metadata?.name || ''
    nodeCap.set(name, {
      cores: parseCpuQuantity(n.status?.capacity?.cpu),
      bytes: parseMemQuantity(n.status?.capacity?.memory),
    })
    return {
      name,
      ready,
      role,
      cpu: String(n.status?.capacity?.cpu || '-'),
      memory: String(n.status?.capacity?.memory || '-'),
      status,
    }
  })

  const workloads: K8sWorkloadInfo[] = (depRes.items || []).map((d) => ({
    name: d.metadata?.name || '',
    namespace: d.metadata?.namespace || '',
    kind: 'Deployment',
    status:
      d.status?.conditions?.some((c) => c.type === 'Available' && c.status === 'True')
        ? 'Available'
        : 'Progressing',
    replicas: `${d.status?.availableReplicas ?? 0}/${d.status?.replicas ?? 0}`,
  }))

  // 服务视图与端点就绪度（获取失败降级为空，不影响集群详情主流程）
  let services: ClusterServiceInfo[] = []
  try {
    const [svcRes, epRes] = await Promise.all([
      core.listServiceForAllNamespaces(),
      core.listEndpointsForAllNamespaces(),
    ])
    const readyBySvc = new Map<string, number>()
    for (const ep of epRes.items || []) {
      const count = (ep.subsets || []).reduce(
        (acc, s) => acc + (s.addresses?.filter(Boolean).length || 0),
        0,
      )
      readyBySvc.set(`${ep.metadata?.namespace}/${ep.metadata?.name}`, count)
    }
    services = (svcRes.items || []).map((s) => ({
      name: s.metadata?.name || '',
      namespace: s.metadata?.namespace || '',
      type: s.spec?.type || 'ClusterIP',
      clusterIP: s.spec?.clusterIP || '-',
      ports: (s.spec?.ports || []).map((p) => `${p.port}${p.nodePort ? `:${p.nodePort}` : ''}/${p.protocol || 'TCP'}`).join(', ') || '-',
      readyEndpoints: s.spec?.type === 'ExternalName' ? -1 : (readyBySvc.get(`${s.metadata?.namespace}/${s.metadata?.name}`) ?? 0),
    }))
  } catch {
    services = []
  }

  // 节点资源使用率（metrics-server 可用时填充，按节点容量换算百分比）
  const usage = await fetchNodeMetrics(kc)
  for (const n of nodes) {
    const u = usage[n.name]
    const cap = nodeCap.get(n.name)
    if (u && cap && cap.cores > 0 && cap.bytes > 0) {
      n.cpuUsagePct = Math.min(100, Math.round((u.cpuCores / cap.cores) * 100))
      n.memoryUsagePct = Math.min(100, Math.round((u.memBytes / cap.bytes) * 100))
    }
  }

  const readyCount = nodes.filter((n) => n.ready).length
  const connected = nodes.length > 0
  const healthScore = nodes.length ? Math.round((readyCount / nodes.length) * 100) : 0
  const status: Status = !connected ? 'unknown' : readyCount === nodes.length ? 'ok' : 'warn'

  return {
    cluster: { ...cluster, connected, nodeCount: nodes.length, healthScore, status },
    nodes,
    workloads,
    agents: [],
    services,
  }
}
