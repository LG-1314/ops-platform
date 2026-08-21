// 前端类型化 REST 封装：仅用浏览器 fetch，绝不 import engine.ts（会引入 node:child_process）。
// 所有类型来自 shared/types。统一信封：成功 code=0；code!==0 时抛 ApiClientError。
// 前端 API 基地址由 Electron preload 注入（生产态为 http://127.0.0.1:<port>/api）。
// 原因：生产态首屏经自定义协议 app:// 加载，file:// / app:// 下相对路径不成立；
// 开发态 Vite dev server 代理 /api 到 8787，但 Express 本身也监听 8787 且 CORS 全开，绝对地址同样可用。
declare global {
  interface Window {
    opsApi?: {
      apiBase?: string
      token?: () => Promise<string>
      request?: (method: string, path: string, body?: unknown, userToken?: string) => Promise<unknown>
    }
  }
}
const API_BASE = window.opsApi?.apiBase || 'http://127.0.0.1:8787/api'

// RBAC 会话 token 的 localStorage 键（登录后写入，request 自动携带）
export const USER_TOKEN_KEY = 'ops-user-token'
export const USER_INFO_KEY = 'ops-user-info'
export const USER_TOKEN_HEADER = 'x-ops-user-token'
import type {
  ApiResponse,
  ApiError,
  DiagnoseResult,
  Asset,
  AssetType,
  KnowledgeHit,
  RelatedProject,
  PatrolTask,
  PatrolRun,
  Alert,
  AlertLevel,
  AlertState,
  Incident,
  CicdPipeline,
  IncidentState,
  ClusterInfo,
  ClusterDetail,
  GuardrailResult,
  GuardrailRun,
  DoloresResult,
  FirewallCollectResult,
  FirewallRule,
  AddFirewallRuleInput,
  DoloresRun,
  DoloresTool,
  DashboardSummary,
  Credential,
  HostMetricSample,
  DbConnection,
  DbHealth,
  CloudAccount,
  CloudResource,
  AlertRule,
  CreateCredentialInput,
  NotificationChannel,
  SafeUser,
  UserRole,
  HealthPoint,
  Status,
} from '@shared/types'

class ApiClientError extends Error {
  code: number
  detail?: string
  constructor(e: ApiError) {
    super(e.message)
    this.name = 'ApiClientError'
    this.code = e.code
    this.detail = e.detail
  }
}

type Query = Record<string, string | number | undefined>

// —— 全局 401 会话过期处理 ——
// 后端会话 24h 滑动过期：任一请求收到 401（登录页以外的受保护接口）即触发，
// 由 App 注册处理器清空本地会话 → AuthGate 自动跳回登录页，避免各页面各自报英文错误。
type UnauthorizedHandler = () => void
let unauthorizedHandler: UnauthorizedHandler | null = null
export function onUnauthorized(handler: UnauthorizedHandler): void {
  unauthorizedHandler = handler
}

function buildQuery(query?: Query): string {
  if (!query) return ''
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v != null) params.set(k, String(v))
  }
  const s = params.toString()
  return s ? `?${s}` : ''
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // 经 ipc 由主进程转发 Express（绕过 Chromium 网络栈，规避 127.0.0.1 回环被拦截）
  const method = (init?.method || 'GET').toUpperCase()
  const body = init?.body ? JSON.parse(init.body as string) : undefined
  const rpc = window.opsApi?.request
  // RBAC 会话：本地保存的登录 token 随请求透传（x-ops-user-token）
  let userToken: string | undefined
  try {
    userToken = localStorage.getItem(USER_TOKEN_KEY) || undefined
  } catch {
    /* ignore */
  }
  if (!rpc) {
    // 降级：纯浏览器开发预览（无 Electron preload），直接 fetch 同源 /api（Vite 代理）
    const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined) }
    if (init?.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
    if (userToken) headers[USER_TOKEN_HEADER] = userToken
    const res = await fetch(`${API_BASE}${path}`, { ...init, headers })
    let json: ApiResponse<T> & Partial<ApiError>
    try {
      json = (await res.json()) as ApiResponse<T> & Partial<ApiError>
    } catch {
      throw new ApiClientError({ code: res.status, message: `HTTP ${res.status}`, detail: '响应非 JSON' })
    }
    if (json.code !== 0) {
      if (json.code === 401 && path !== '/auth/login') unauthorizedHandler?.()
      throw new ApiClientError({ code: json.code, message: json.message, detail: json.detail })
    }
    return json.data as T
  }
  const res = (await rpc(method, path, body, userToken)) as ApiResponse<T> & Partial<ApiError>
  if (res.code !== 0) {
    if (res.code === 401 && path !== '/auth/login') unauthorizedHandler?.()
    throw new ApiClientError({
      code: res.code,
      message: res.message,
      detail: res.detail,
    })
  }
  return res.data as T
}

function get<T>(path: string, query?: Query): Promise<T> {
  return request<T>(`${path}${buildQuery(query)}`)
}
function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    body: body != null ? JSON.stringify(body) : undefined,
  })
}
function put<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'PUT',
    body: body != null ? JSON.stringify(body) : undefined,
  })
}
function patch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'PATCH',
    body: body != null ? JSON.stringify(body) : undefined,
  })
}
function del<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' })
}

/** 类型化 API 客户端（命名空间与后端路由一一对应） */
export const api = {
  request: request as <T>(path: string, init?: RequestInit) => Promise<T>,
  health: () => get<{ ok: boolean }>('/health'),
  assets: {
    list: (q?: string, type?: AssetType) => get<Asset[]>('/assets', { q, type }),
    get: (id: string) => get<Asset>(`/assets/${id}`),
    create: (a: Partial<Asset>) => post<Asset>('/assets', a),
    update: (id: string, a: Partial<Asset>) => put<Asset>(`/assets/${id}`, a),
    remove: (id: string) => del<{ ok: true }>(`/assets/${id}`),
    discover: () => post<Asset[]>('/assets/discover'),
    probeAll: () => post<Asset[]>('/assets/probe'),
    probe: (id: string) => post<Asset>(`/assets/${id}/probe`),
  },
  diagnostics: {
    run: (assetId?: string) => post<DiagnoseResult>('/diagnostics/run', { assetId }),
    history: (assetId?: string) =>
      get<DiagnoseResult[]>('/diagnostics/history', { assetId }),
  },
  dashboard: {
    summary: () => get<DashboardSummary>('/dashboard'),
  },
  knowledge: {
    search: (q: string) => get<KnowledgeHit[]>('/knowledge/search', { q }),
    list: () => get<KnowledgeHit[]>('/knowledge'),
    get: (id: string) => get<KnowledgeHit>(`/knowledge/${id}`),
    create: (k: Partial<KnowledgeHit>) => post<KnowledgeHit>('/knowledge', k),
    update: (id: string, k: Partial<KnowledgeHit>) =>
      put<KnowledgeHit>(`/knowledge/${id}`, k),
    remove: (id: string) => del<{ ok: true }>(`/knowledge/${id}`),
  },
  relations: {
    of: (asset: string) =>
      get<RelatedProject[]>(`/relations/${encodeURIComponent(asset)}`),
    all: () => get<RelatedProject[]>('/relations'),
  },
  patrols: {
    list: () => get<PatrolTask[]>('/patrols'),
    get: (id: string) => get<PatrolTask>(`/patrols/${id}`),
    create: (p: Partial<PatrolTask>) => post<PatrolTask>('/patrols', p),
    update: (id: string, p: Partial<PatrolTask>) =>
      put<PatrolTask>(`/patrols/${id}`, p),
    remove: (id: string) => del<{ ok: true }>(`/patrols/${id}`),
    run: (id: string) => post<PatrolRun>(`/patrols/${id}/run`),
  },
  alerts: {
    list: (level?: AlertLevel, state?: AlertState, assetId?: string) =>
      get<Alert[]>('/alerts', { level, state, assetId }),
    create: (a: Partial<Alert>) => post<Alert>('/alerts', a),
    patch: (id: string, state: AlertState) =>
      patch<Alert>(`/alerts/${id}`, { state }),
    remove: (id: string) => del<{ ok: true }>(`/alerts/${id}`),
  },
  automation: {
    incidents: () => get<Incident[]>('/automation/incidents'),
    createIncident: (i: Partial<Incident>) =>
      post<Incident>('/automation/incidents', i),
    patchIncident: (id: string, state: IncidentState) =>
      patch<Incident>(`/automation/incidents/${id}`, { state }),
    removeIncident: (id: string) =>
      del<{ ok: true }>(`/automation/incidents/${id}`),
    cicd: () => get<CicdPipeline[]>('/automation/cicd'),
    createPipeline: (p: Partial<CicdPipeline>) =>
      post<CicdPipeline>('/automation/cicd', p),
    patchPipeline: (id: string, p: Partial<CicdPipeline>) =>
      patch<CicdPipeline>(`/automation/cicd/${id}`, p),
    removePipeline: (id: string) =>
      del<{ ok: true }>(`/automation/cicd/${id}`),
  },
  clusters: {
    list: () => get<ClusterInfo[]>('/clusters'),
    get: (id: string) => get<ClusterDetail>(`/clusters/${id}`),
    scan: (id: string) => post<ClusterDetail>(`/clusters/${id}/scan`),
    create: (c: Partial<ClusterInfo>) => post<ClusterInfo>('/clusters', c),
    update: (id: string, c: Partial<ClusterInfo>) => put<ClusterInfo>(`/clusters/${id}`, c),
    remove: (id: string) => del<{ ok: true }>(`/clusters/${id}`),
  },
  guardrails: {
    check: (scope: string, target?: string, content?: string) =>
      post<GuardrailResult>('/guardrails/check', { scope, target, content }),
    history: () => get<GuardrailRun[]>('/guardrails/history'),
  },
  dolores: {
    run: (tool: DoloresTool) => post<DoloresResult>('/dolores/run', { tool }),
    history: () => get<DoloresRun[]>('/dolores/history'),
  },
  credentials: {
    list: () => get<Credential[]>('/credentials'),
    create: (c: CreateCredentialInput) => post<Credential>('/credentials', c),
    update: (id: string, c: CreateCredentialInput) => put<Credential>(`/credentials/${id}`, c),
    remove: (id: string) => del<{ ok: true }>(`/credentials/${id}`),
  },
  ssh: {
    collect: (body: { host: string; port?: number; credentialId?: string; assetId?: string }) =>
      post<HostMetricSample>('/ssh/collect', body),
  },
  metrics: {
    history: (assetId: string, from?: string, to?: string) =>
      get<HostMetricSample[]>('/metrics/history', { assetId, from, to }),
  },
  db: {
    list: () => get<DbConnection[]>('/db'),
    create: (c: Partial<DbConnection>) => post<DbConnection>('/db', c),
    health: (id: string) => get<DbHealth>(`/db/${id}/health`),
    remove: (id: string) => del<{ ok: true }>(`/db/${id}`),
  },
  cloud: {
    list: () => get<CloudAccount[]>('/cloud'),
    create: (c: Partial<CloudAccount>) => post<CloudAccount>('/cloud', c),
    resources: (id: string) => get<CloudResource[]>(`/cloud/${id}/resources`),
    remove: (id: string) => del<{ ok: true }>(`/cloud/${id}`),
  },
  alertRules: {
    list: () => get<AlertRule[]>('/alert-rules'),
    create: (r: Partial<AlertRule>) => post<AlertRule>('/alert-rules', r),
    update: (id: string, r: Partial<AlertRule>) => put<AlertRule>(`/alert-rules/${id}`, r),
    remove: (id: string) => del<{ ok: true }>(`/alert-rules/${id}`),
    evaluate: () => post<{ created: number }>('/alert-rules/evaluate'),
  },
  notificationChannels: {
    list: () => get<NotificationChannel[]>('/notification-channels'),
    create: (c: Partial<NotificationChannel>) => post<NotificationChannel>('/notification-channels', c),
    update: (id: string, c: Partial<NotificationChannel>) => put<NotificationChannel>(`/notification-channels/${id}`, c),
    remove: (id: string) => del<{ ok: true }>(`/notification-channels/${id}`),
    test: (id: string) => post<{ ok: boolean; message: string }>(`/notification-channels/${id}/test`),
  },
  auth: {
    login: (username: string, password: string) =>
      post<{ token: string; user: SafeUser }>('/auth/login', { username, password }),
    logout: () => post<{ ok: true }>('/auth/logout'),
    me: () => get<SafeUser>('/auth/me'),
    changePassword: (oldPassword: string, newPassword: string) =>
      post<{ ok: true }>('/auth/change-password', { oldPassword, newPassword }),
  },
  users: {
    list: () => get<SafeUser[]>('/users'),
    create: (u: { username: string; password: string; displayName?: string; role?: UserRole }) =>
      post<SafeUser>('/users', u),
    update: (id: string, u: { displayName?: string; role?: UserRole; password?: string }) =>
      put<SafeUser>(`/users/${id}`, u),
    remove: (id: string) => del<{ ok: true }>(`/users/${id}`),
  },
  monitor: {
    summary: () => get<MonitorSummary>('/monitor/summary'),
    healthHistory: (kind: 'db' | 'cluster', assetId: string, from?: string, to?: string) =>
      get<HealthPoint[]>('/monitor/health-history', { kind, assetId, from, to }),
  },
  firewall: {
    collect: (assetId: string) => get<FirewallCollectResult>(`/firewall/${assetId}/collect`),
    addRule: (assetId: string, input: AddFirewallRuleInput) =>
      post<{ ok: boolean; message: string; rule?: FirewallRule }>(`/firewall/${assetId}/rule`, input),
    deleteRule: (assetId: string, raw: string) =>
      del<{ ok: boolean; message: string }>(`/firewall/${assetId}/rule?raw=${encodeURIComponent(raw)}`),
  },
}

/** 监控大盘汇总结构（与 /api/monitor/summary 对应） */
export interface MonitorSummary {
  totalAssets: number
  activeAlerts: number
  hosts: {
    id: string
    name: string
    host?: string
    port?: number
    credentialId?: string
    status: Status
    reachable?: boolean
    healthScore?: number
    latencyMs?: number
    lastCheckAt?: string
    cpuPct?: number
    memPct?: number
    diskPct?: number
    netRx?: number
    netTx?: number
    collectedAt?: string
  }[]
  dbCount: number
  clusterCount: number
  checkedAt: string
}

/** 构造终端 WebSocket 地址（与 REST 同端口，路径 /api/terminal）。
 *  需携带应用令牌（token）+ 用户会话令牌（userToken）以通过服务端 verifyClient 双层鉴权。 */
export function terminalWsUrl(
  params: Record<string, string | number | undefined>,
  token?: string,
  userToken?: string
): string {
  let base = 'ws://127.0.0.1:8787/api'
  const m = API_BASE.match(/https?:\/\/([^/]+)/)
  if (m) base = `ws://${m[1]}/api`
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v != null) qs.set(k, String(v))
  if (token) qs.set('token', token)
  if (userToken) qs.set('ut', userToken)
  return `${base}/terminal?${qs.toString()}`
}

export { ApiClientError }
export default api
