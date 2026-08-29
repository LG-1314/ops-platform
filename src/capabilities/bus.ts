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
  AssetConnectionTestResult,
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
  ClusterDiagItem,
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
  CloudChangeLog,
  ServiceCheck,
  AlertRule,
  CreateCredentialInput,
  NotificationChannel,
  SafeUser,
  UserRole,
  HealthPoint,
  Status,
  AiAgent,
  AiProviderDef,
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

// 超时 / 重试策略：默认 30s 中止；仅幂等 GET 在网络类失败时自动重试（最多 2 次，指数退避）
const REQUEST_TIMEOUT_MS = 30_000
const GET_RETRY_DELAYS_MS = [500, 1500]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
  const attempt = (): Promise<T> => {
    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, REQUEST_TIMEOUT_MS)
    const doFetch = async (): Promise<T> => {
      // 降级：纯浏览器开发预览（无 Electron preload），直接 fetch 同源 /api（Vite 代理）
      const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined) }
      if (init?.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
      if (userToken) headers[USER_TOKEN_HEADER] = userToken
      let json: ApiResponse<T> & Partial<ApiError>
      try {
        const res = await fetch(`${API_BASE}${path}`, { ...init, headers, signal: controller.signal })
        try {
          json = (await res.json()) as ApiResponse<T> & Partial<ApiError>
        } catch {
          throw new ApiClientError({ code: res.status, message: `HTTP ${res.status}`, detail: '响应非 JSON' })
        }
      } catch (e) {
        if (e instanceof ApiClientError) throw e
        if (timedOut) throw new ApiClientError({ code: -1, message: '请求超时，请稍后重试' })
        throw new ApiClientError({ code: -1, message: '网络异常，请检查连接' })
      } finally {
        clearTimeout(timer)
      }
      if (json.code !== 0) {
        if (json.code === 401 && path !== '/auth/login') unauthorizedHandler?.()
        throw new ApiClientError({ code: json.code, message: json.message, detail: json.detail })
      }
      return json.data as T
    }
    const doRpc = async (): Promise<T> => {
      try {
        const res = (await Promise.race([
          rpc!(method, path, body, userToken),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), REQUEST_TIMEOUT_MS)
          ),
        ])) as ApiResponse<T> & Partial<ApiError>
        if (res.code !== 0) {
          if (res.code === 401 && path !== '/auth/login') unauthorizedHandler?.()
          throw new ApiClientError({
            code: res.code,
            message: res.message,
            detail: res.detail,
          })
        }
        return res.data as T
      } catch (e) {
        if (e instanceof ApiClientError) throw e
        if (e instanceof Error && e.message === 'timeout')
          throw new ApiClientError({ code: -1, message: '请求超时，请稍后重试' })
        throw new ApiClientError({ code: -1, message: '网络异常，请检查连接' })
      } finally {
        clearTimeout(timer)
      }
    }
    return rpc ? doRpc() : doFetch()
  }
  const retryable = (e: unknown): boolean =>
    method === 'GET' && e instanceof ApiClientError && e.code === -1
  let lastErr: unknown
  for (let i = 0; i <= GET_RETRY_DELAYS_MS.length; i++) {
    try {
      return await attempt()
    } catch (e) {
      lastErr = e
      if (i < GET_RETRY_DELAYS_MS.length && retryable(e)) {
        await sleep(GET_RETRY_DELAYS_MS[i])
        continue
      }
      throw e
    }
  }
  throw lastErr
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
    testConnection: (target: Pick<Asset, 'host' | 'ip' | 'port'>) => post<AssetConnectionTestResult>('/assets/test-connection', target),
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
    markRead: (id: string) => post<Alert>(`/alerts/${id}/read`),
    setPinned: (id: string, pinned: boolean) => post<Alert>(`/alerts/${id}/pin`, { pinned }),
    remove: (id: string) => del<{ ok: true }>(`/alerts/${id}`),
  },
  automation: {
    incidents: () => get<Incident[]>('/automation/incidents'),
    createIncident: (i: Partial<Incident>) =>
      post<Incident>('/automation/incidents', i),
    patchIncident: (id: string, state: IncidentState) =>
      patch<Incident>(`/automation/incidents/${id}`, { state }),
    updateIncident: (id: string, i: Partial<Incident>) =>
      put<Incident>(`/automation/incidents/${id}`, i),
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
    diagnose: (id: string) => post<{ items: ClusterDiagItem[] }>(`/clusters/${id}/diagnose`),
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
    update: (id: string, c: Partial<DbConnection>) => put<DbConnection>(`/db/${id}`, c),
    health: (id: string) => get<DbHealth>(`/db/${id}/health`),
    remove: (id: string) => del<{ ok: true }>(`/db/${id}`),
  },
  cloud: {
    list: () => get<CloudAccount[]>('/cloud'),
    create: (c: Partial<CloudAccount>) => post<CloudAccount>('/cloud', c),
    update: (id: string, c: Partial<CloudAccount>) => put<CloudAccount>(`/cloud/${id}`, c),
    resources: (id: string) => get<CloudResource[]>(`/cloud/${id}/resources`),
    changes: (id: string) => get<CloudChangeLog[]>(`/cloud/${id}/changes`),
    allChanges: () => get<CloudChangeLog[]>('/cloud/changes/all'),
    remove: (id: string) => del<{ ok: true }>(`/cloud/${id}`),
  },
  serviceChecks: {
    list: () => get<ServiceCheck[]>('/service-checks'),
    create: (c: Partial<ServiceCheck>) => post<ServiceCheck>('/service-checks', c),
    update: (id: string, c: Partial<ServiceCheck>) => put<ServiceCheck>(`/service-checks/${id}`, c),
    remove: (id: string) => del<{ ok: true }>(`/service-checks/${id}`),
    run: (id: string) => post<ServiceCheck>(`/service-checks/${id}/run`),
    runAll: () => post<ServiceCheck[]>('/service-checks/run-all'),
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
  sshServices: {
    check: (body: { host: string; port?: number; credentialId?: string; name?: string }) =>
      post<{ name: string; status: string; description: string; active: boolean }[]>('/ssh/services', body),
  },
  ai: {
    config: () => get<{ baseUrl: string; model: string; provider: string; temperature: number; enabled: boolean; hasApiKey: boolean }>('/ai/config'),
    providers: () => get<AiProviderDef[]>('/ai/providers'),
    saveConfig: (b: { baseUrl?: string; apiKey?: string; model?: string; enabled?: boolean; provider?: string; temperature?: number }) =>
      put<{ baseUrl: string; model: string; provider: string; temperature: number; enabled: boolean; hasApiKey: boolean }>('/ai/config', b),
    test: () => post<{ ok: boolean; message: string }>('/ai/config/test'),
    chat: (messages: { role: string; content: string }[], context?: { kind: string; payload: Record<string, unknown> }) =>
      post<{ reply: string }>('/ai/chat', { messages, context }),
    qa: (question: string, related?: string[]) =>
      post<{ reply: string }>('/ai/qa', { question, related }),
    report: () => post<{ report: string }>('/ai/report'),
    analyzeHost: (assetId: string) =>
      post<{ reply: string }>('/ai/analyze-host', { assetId }),
    agents: {
      list: () => get<AiAgent[]>('/ai/agents'),
      create: (a: Partial<AiAgent>) => post<AiAgent>('/ai/agents', a),
      update: (id: string, a: Partial<AiAgent>) => put<AiAgent>(`/ai/agents/${id}`, a),
      remove: (id: string) => del<{ ok: true }>(`/ai/agents/${id}`),
      chat: (agentId: string, messages?: { role: string; content: string }[], context?: { kind: string; payload: Record<string, unknown> }) =>
        post<{ reply: string }>('/ai/agent-chat', { agentId, messages, context }),
    },
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
    statusReason?: string
    reachable?: boolean
    healthScore: number | null
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
