// 跨端 DTO 单一真源：前端 bus.ts 与后端 service/route 共用。
// 注意：engine.ts 内部也定义了 Status/Metric/DiagnoseResult，结构与本文件兼容（不改动 engine.ts）。

// —— 状态枚举（与 engine.ts 兼容）——
export type Status = 'ok' | 'warn' | 'error' | 'unknown'

// —— 诊断（复用 engine.ts 结构）——
export interface Metric {
  name: string
  value: string
  normal: string
  status: Status
  detail?: string
}
export interface DiagnoseResult {
  platform: string
  host: string
  timestamp: string
  metrics: Metric[]
  suggestions: string[]
}

// —— 资产 ——
export type AssetType = 'server' | 'middleware' | 'container' | 'database' | 'network'
export type AssetSource = 'manual' | 'auto' | 'agent' | 'ssh' | 'api'
export interface Asset {
  id: string
  name: string
  type: AssetType
  host: string
  ip?: string
  port?: number // 监控探测端口（可选；留空则按主机名/IP 做 ICMP ping）
  source: AssetSource
  tags: string[]
  createdAt: string
  credentialId?: string // SSH/监控凭据关联（主机经 SSH 采集指标、启动终端时使用）
  healthScore: number // 0-100
  status: Status
  reachable?: boolean // 最近一次存活探测结果（true=在线）
  latencyMs?: number // 最近一次探测往返延迟（ms）
  lastCheckAt?: string // 最近一次探测时间（ISO）
  lastScanAt?: string
}

// —— 知识检索 / 关联 ——
export interface KnowledgeHit {
  id: string
  title: string
  content: string
  source: string // 'builtin-faq' | 'remote'
  tags: string[]
  relatedAssets: string[]
}
export interface RelatedProject {
  asset: string
  project: string
  ticket: string
  knowledge: string
  note: string
}

// —— 巡检 ——
export type PatrolLayer = 'basic' | 'middleware' | 'container' | 'log' | 'business'
export type PatrolStatus = 'idle' | 'running' | 'success' | 'failed' | 'scheduled'
export interface PatrolRun {
  id: string
  taskId: string
  startedAt: string
  finishedAt?: string
  status: PatrolStatus
  summary: string
}
export interface PatrolTask {
  id: string
  name: string
  layers: PatrolLayer[]
  cron: string
  enabled: boolean
  status: PatrolStatus
  lastRunAt?: string
  nextRunAt?: string
  history: PatrolRun[]
}

// —— 告警 ——
export type AlertLevel = 'P0' | 'P1' | 'P2' | 'P3'
export type AlertState = 'active' | 'ack' | 'silenced' | 'resolved'
export interface Alert {
  id: string
  level: AlertLevel
  title: string
  assetId?: string
  message: string
  state: AlertState
  createdAt: string
  ackedBy?: string
}

// —— 仪表盘 ——
export interface AssetHealthRow {
  id: string
  name: string
  status: Status
  healthScore: number
}
export interface DashboardSummary {
  totalAssets: number
  healthDistribution: Record<Status, number>
  activeAlerts: number
  patrolsToday: number
  assets: AssetHealthRow[]
  recentAlerts: Alert[]
}

// —— 报告 ——
export interface ReportRequest {
  type: 'diagnose' | 'patrol' | 'dashboard'
  assetId?: string
  format: 'markdown' | 'pdf'
  title?: string
}
export interface ReportResult {
  format: 'markdown' | 'pdf'
  filename: string
  content: string // markdown 文本；pdf 为占位/base64 dataurl
  generatedAt: string
}

// —— 自动化 / 事故 ——
export type IncidentState = 'open' | 'investigating' | 'resolved' | 'postmortem'
export interface Incident {
  id: string
  title: string
  state: IncidentState
  level: AlertLevel
  assetId?: string
  assignee?: string
  createdAt: string
  updatedAt: string
  relatedKnowledge: string[]
}
export interface CicdPipeline {
  id: string
  name: string
  status: 'success' | 'failed' | 'running' | 'pending'
  lastRunAt?: string
  stage: string
}

// —— K8s 集群 ——
export interface ClusterInfo {
  id: string
  name: string
  endpoint: string
  connected: boolean
  nodeCount: number
  healthScore: number
  status: Status
  credentialId?: string
  authType?: 'token' | 'kubeconfig' | 'credential'
}
export interface ClusterNode {
  name: string
  ready: boolean
  role: string
  cpu: string
  memory: string
}
export interface ClusterWorkload {
  name: string
  namespace: string
  kind: string
  status: string
  replicas: string
}
export interface AgentStatus {
  name: string
  role: string
  status: Status
}
export interface ClusterDetail {
  cluster: ClusterInfo
  nodes: ClusterNode[]
  workloads: ClusterWorkload[]
  agents: AgentStatus[]
}

// —— OpenClaw Guardrails ——
export interface GuardrailCheck {
  id: string
  category: 'desensitize' | 'approval' | 'cross-device'
  target: string
  risk: 'low' | 'medium' | 'high'
  passed: boolean
  message: string
}
export interface GuardrailResult {
  id: string
  scope: string
  checkedAt: string
  checks: GuardrailCheck[]
  riskItems: number
  passed: boolean
}

// —— Dolores 工具箱 ——
export type DoloresTool = 'health' | 'memory-sync' | 'dir-clean' | 'log' | 'cron'
export interface DoloresResult {
  tool: DoloresTool
  status: Status
  logs: string[]
  executedAt: string
}

// —— 凭据（敏感字段加密存储，绝不明文落盘）——
export type CredentialKind = 'ssh' | 'db' | 'k8s' | 'cloud'
export type DbType = 'mysql' | 'postgres' | 'redis'
export type CloudProvider = 'tencent' | 'aliyun'

export interface Credential {
  id: string
  name: string
  kind: CredentialKind
  createdAt: string
  host?: string
  port?: number
  username?: string
  database?: string
  dbType?: DbType
  provider?: CloudProvider
  region?: string
  endpoint?: string
  passwordEnc?: string
  privateKeyEnc?: string
  secretKeyEnc?: string
  accessKeyEnc?: string
  tokenEnc?: string
  kubeconfigEnc?: string
}

export interface CreateCredentialInput {
  name: string
  kind: CredentialKind
  host?: string
  port?: number
  username?: string
  database?: string
  dbType?: DbType
  provider?: CloudProvider
  region?: string
  endpoint?: string
  password?: string
  privateKey?: string
  secretKey?: string
  accessKey?: string
  token?: string
  kubeconfig?: string
}

// —— SSH 主机指标采集 ——
export interface DiskUsage {
  mount: string
  totalGb: number
  usedGb: number
  usedPct: number
}
export interface HostMetricSample {
  assetId: string
  collectedAt: string
  hostname?: string
  uptime?: string
  load1?: number
  load5?: number
  load15?: number
  cpuUser?: number
  cpuSystem?: number
  cpuIdle?: number
  memTotalMb?: number
  memUsedMb?: number
  memFreeMb?: number
  swapUsedMb?: number
  disk: DiskUsage[]
  status: Status
}

// —— 数据库监控 ——
export interface DbConnection {
  id: string
  name: string
  dbType: DbType
  host: string
  port: number
  database?: string
  username?: string
  credentialId?: string
  createdAt: string
}
export interface DbMetric {
  name: string
  value: string
  status: Status
}
export interface DbHealth {
  id: string
  connectionId: string
  dbType: DbType
  connected: boolean
  version?: string
  metrics: DbMetric[]
  checkedAt: string
  error?: string
}

// —— K8s 集群详情 ——
export interface K8sNodeInfo {
  name: string
  ready: boolean
  role: string
  cpu: string
  memory: string
  status: Status
}
export interface K8sWorkloadInfo {
  name: string
  namespace: string
  kind: string
  status: string
  replicas: string
}

// —— 云账号与资源 ——
export interface CloudAccount {
  id: string
  name: string
  provider: CloudProvider
  region?: string
  accessKey?: string
  credentialId?: string
  createdAt: string
}
export interface CloudResource {
  id: string
  name: string
  type: string
  region: string
  zone?: string
  status: string
  extra?: Record<string, string>
}

// —— 告警规则引擎 ——
export type AlertMetric = 'reachable' | 'latency' | 'healthScore' | 'cpu' | 'mem' | 'disk'
export type AlertOperator = '>' | '>=' | '<' | '<=' | '==' | '!='
export interface AlertRule {
  id: string
  name: string
  enabled: boolean
  scope: 'asset' | 'all'
  assetId?: string
  metric: AlertMetric
  operator: AlertOperator
  threshold: number
  level: AlertLevel
  message?: string
  createdAt: string
}

// —— API 统一信封 ——
export interface ApiResponse<T> {
  code: number
  data: T
  message: string
}
export interface ApiError {
  code: number
  message: string
  detail?: string
}
