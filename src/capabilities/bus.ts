// 前端类型化 REST 封装：仅用浏览器 fetch，绝不 import engine.ts（会引入 node:child_process）。
// 所有类型来自 shared/types。统一信封：成功 code=0；code!==0 时抛 ApiClientError。
// 前端 API 基地址由 Electron preload 注入（生产态为 http://127.0.0.1:<port>/api）。
// 原因：生产态首屏经自定义协议 app:// 加载，file:// / app:// 下相对路径不成立；
// 开发态 Vite dev server 代理 /api 到 8787，但 Express 本身也监听 8787 且 CORS 全开，绝对地址同样可用。
declare global {
  interface Window {
    opsApi?: {
      apiBase?: string
      request?: (method: string, path: string, body?: unknown) => Promise<unknown>
    }
  }
}
const API_BASE = window.opsApi?.apiBase || 'http://127.0.0.1:8787/api'
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
  ReportRequest,
  ReportResult,
  Incident,
  CicdPipeline,
  IncidentState,
  ClusterInfo,
  ClusterDetail,
  GuardrailResult,
  DoloresResult,
  DoloresTool,
  DashboardSummary,
  Credential,
  CredentialKind,
  HostMetricSample,
  DbConnection,
  DbHealth,
  DbType,
  CloudAccount,
  CloudProvider,
  CloudResource,
  AlertRule,
  AlertMetric,
  AlertOperator,
  CreateCredentialInput,
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
  if (!rpc) {
    throw new ApiClientError({ code: -1, message: 'opsApi.request 不可用（preload 未注入）' })
  }
  const res = (await rpc(method, path, body)) as ApiResponse<T> & Partial<ApiError>
  if (res.code !== 0) {
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
    get: (id: string) => get<KnowledgeHit>(`/knowledge/${id}`),
    create: (k: Partial<KnowledgeHit>) => post<KnowledgeHit>('/knowledge', k),
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
  reports: {
    export: (req: ReportRequest) => post<ReportResult>('/reports/export', req),
  },
  automation: {
    incidents: () => get<Incident[]>('/automation/incidents'),
    createIncident: (i: Partial<Incident>) =>
      post<Incident>('/automation/incidents', i),
    patchIncident: (id: string, state: IncidentState) =>
      patch<Incident>(`/automation/incidents/${id}`, { state }),
    cicd: () => get<CicdPipeline[]>('/automation/cicd'),
  },
  clusters: {
    list: () => get<ClusterInfo[]>('/clusters'),
    get: (id: string) => get<ClusterDetail>(`/clusters/${id}`),
    scan: (id: string) => post<ClusterDetail>(`/clusters/${id}/scan`),
    create: (c: Partial<ClusterInfo>) => post<ClusterInfo>('/clusters', c),
  },
  guardrails: {
    check: (scope: string, target?: string) =>
      post<GuardrailResult>('/guardrails/check', { scope, target }),
  },
  dolores: {
    run: (tool: DoloresTool) => post<DoloresResult>('/dolores/run', { tool }),
  },
  credentials: {
    list: () => get<Credential[]>('/credentials'),
    create: (c: CreateCredentialInput) => post<Credential>('/credentials', c),
    remove: (id: string) => del<{ ok: true }>(`/credentials/${id}`),
  },
  ssh: {
    collect: (body: { host: string; port?: number; credentialId?: string }) =>
      post<HostMetricSample>('/ssh/collect', body),
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
}

/** 构造终端 WebSocket 地址（与 REST 同端口，路径 /api/terminal）。 */
export function terminalWsUrl(params: Record<string, string | number | undefined>): string {
  let base = 'ws://127.0.0.1:8787/api'
  const m = API_BASE.match(/https?:\/\/([^/]+)/)
  if (m) base = `ws://${m[1]}/api`
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v != null) qs.set(k, String(v))
  return `${base}/terminal?${qs.toString()}`
}

export { ApiClientError }
export default api
