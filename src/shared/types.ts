// 跨端 DTO 单一真源：前端 bus.ts 与后端 service/route 共用。
// 注意：engine.ts 内部也定义了 Status/Metric/DiagnoseResult，结构与本文件兼容（不改动 engine.ts）。

// —— 状态枚举（与 engine.ts 兼容）——
export type Status = 'ok' | 'warn' | 'error' | 'unknown'

// —— 用户身份视角（本地单机工具，无服务端登录；admin=完整视图，personal=常用精简视图）——
export type UserRole = 'admin' | 'personal'

// —— RBAC 多用户（单机多账号：登录会话 + 角色权限；admin 可管理用户）——
export interface UserAccount {
  id: string
  username: string // 登录名（唯一）
  displayName: string // 显示名
  role: UserRole
  passwordHash: string // scrypt 哈希（盐内嵌，格式 salt:hash）
  createdAt: string
  lastLoginAt?: string
  mustChangePassword?: boolean // 首次登录（播种的默认口令）须强制改密
}
export interface AuthSessionInfo {
  token: string
  user: UserAccount // 不含 passwordHash（脱敏）
}
export interface SafeUser {
  id: string
  username: string
  displayName: string
  role: UserRole
  createdAt: string
  lastLoginAt?: string
  mustChangePassword?: boolean // 首次登录须强制改密
}

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
  statusReason?: string // 最近一次异常原因（采集超时/端口不通/凭据失效等）
  reachable?: boolean // 最近一次存活探测结果（true=在线）
  latencyMs?: number // 最近一次探测往返延迟（ms）
  lastCheckAt?: string // 最近一次探测时间（ISO）
  lastScanAt?: string
}

export interface AssetConnectionTestResult {
  reachable: boolean
  latencyMs?: number
  checkedAt: string
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
  /** 最近一次状态变更时间（确认/静默/解决/重新激活），用于审计与趋势统计 */
  updatedAt?: string
  /** 解决时间（state=resolved 时写入），驱动「已恢复」趋势线 */
  resolvedAt?: string
  /** 触发告警时的指标当前值（资源类告警：CPU/内存/磁盘使用率等） */
  currentValue?: number
  /** 触发告警的规则阈值 */
  threshold?: number
  /** 指标单位（% / ms / KB/s 等） */
  unit?: string
  /** 已读时间（用户查看过详情/标记已读后写入；未读为 undefined） */
  readAt?: string
  /** 是否置顶（列表优先展示） */
  pinned?: boolean
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
  /** metrics-server 可用时的 CPU 使用率（0-100），不可用时缺省 */
  cpuUsagePct?: number
  /** metrics-server 可用时的内存使用率（0-100），不可用时缺省 */
  memoryUsagePct?: number
}
export interface ClusterWorkload {
  name: string
  namespace: string
  kind: string
  status: string
  replicas: string
}
export interface ClusterServiceInfo {
  name: string
  namespace: string
  type: string
  clusterIP: string
  ports: string
  readyEndpoints: number
}
/** 集群连接自检单项结果 */
export interface ClusterDiagItem {
  item: string
  ok: boolean
  detail: string
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
  services?: ClusterServiceInfo[]
}

// —— OpenClaw Guardrails（防呆检查：命令/变更执行前的风险预检）——
export interface GuardrailCheck {
  id: string
  category: 'desensitize' | 'approval' | 'cross-device' | 'dangerous-cmd'
  target: string
  risk: 'low' | 'medium' | 'high'
  passed: boolean
  message: string
}
export interface GuardrailResult {
  id: string
  scope: string
  target: string
  checkedAt: string
  checks: GuardrailCheck[]
  riskItems: number
  passed: boolean
}
// —— 历史运行记录（持久化，供前端列表展示）——
export interface GuardrailRun extends GuardrailResult {
  runType: 'check'
}

// —— Dolores 工具箱 ——
export type DoloresTool = 'health' | 'memory-sync' | 'dir-clean' | 'log' | 'cron'
export interface DoloresResult {
  id: string
  tool: DoloresTool
  status: Status
  logs: string[]
  executedAt: string
}
export interface DoloresRun extends DoloresResult {
  runType: 'run'
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
export interface NetSample {
  rxBytes?: number // 累计接收字节（/proc/net/dev，Linux 专属）
  txBytes?: number // 累计发送字节
  rxRateKbps?: number // 接收速率（KB/s，由两次采样差分得出）
  txRateKbps?: number // 发送速率（KB/s）
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
  network?: NetSample
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

// —— DB/K8s 健康时序点（独立于主机指标，供监控大盘趋势图）——
export interface HealthPoint {
  assetId: string
  kind: 'db' | 'cluster'
  checkedAt: string
  status: Status
  score: number
}

// —— K8s 集群详情 ——
export interface K8sNodeInfo {
  name: string
  ready: boolean
  role: string
  cpu: string
  memory: string
  status: Status
  /** metrics-server 可用时的 CPU 使用率（0-100），不可用时缺省 */
  cpuUsagePct?: number
  /** metrics-server 可用时的内存使用率（0-100），不可用时缺省 */
  memoryUsagePct?: number
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
  /** 最近一次资源同步时间 */
  lastSyncAt?: string
}
export interface CloudResource {
  id: string
  name: string
  type: string
  region: string
  zone?: string
  status: string
  extra?: Record<string, string>
  /** 月度费用估算（元） */
  monthlyCost?: number
  /** 到期时间（ISO 字符串），包年包月实例才有 */
  expireAt?: string
}
/** 云资源同步变更日志（新增/下线/规格变化） */
export interface CloudChangeLog {
  id: string
  accountId: string
  accountName: string
  resourceId: string
  resourceName: string
  changeType: 'add' | 'remove' | 'change'
  detail: string
  at: string
}

// —— 告警规则引擎 ——
export type AlertMetric = 'reachable' | 'latency' | 'healthScore' | 'cpu' | 'mem' | 'disk' | 'netRx' | 'netTx'
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

// —— 通知渠道（告警对外推送：飞书/钉钉/Webhook/应用内/邮件）——
export type NotificationChannelType = 'webhook' | 'feishu' | 'dingtalk' | 'inapp' | 'email'
export interface NotificationChannel {
  id: string
  name: string
  type: NotificationChannelType
  enabled: boolean
  url?: string // webhook / 飞书 / 钉钉 机器人地址
  secret?: string // 入站明文签名密钥（创建/更新时）；落盘即加密为 secretEnc，列表脱敏
  secretEnc?: string // 签名密钥密文（AES-256-GCM）
  // 邮件 SMTP（type === 'email'）
  smtpHost?: string
  smtpPort?: number
  smtpSecure?: boolean // true=SSL/TLS(465)，false=STARTTLS(587)
  smtpUser?: string
  smtpPassword?: string // 入站明文密码；落盘即加密为 smtpPasswordEnc
  smtpPasswordEnc?: string // 邮件密码密文
  smtpFrom?: string // 发件人，默认 = smtpUser
  smtpTo?: string // 收件人，逗号分隔
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

// —— 防火墙管理 / 网络透视（SSH 采集自目标主机）——
export interface FirewallRule {
  chain: string // INPUT / OUTPUT / FORWARD ...
  protocol: string // tcp / udp / icmp / all
  source: string // 源地址（CIDR 或 IP）
  destination: string // 目的地址
  port: string // 目的端口（dport 或 dports，逗号分隔）
  sport?: string // 源端口
  inInterface?: string // 入接口
  outInterface?: string // 出接口
  action: string // ACCEPT / DROP / REJECT / MASQUERADE ...
  comment?: string // 注释
  raw: string // 原始规则（iptables -S 行，用于重建/删除）
  /** 命中包数（iptables -L -v -x 计数） */
  packets?: number
  /** 命中字节数 */
  bytes?: number
}
export interface FirewallTraffic {
  totalPackets: number
  totalBytes: number
  dropPackets: number
  dropBytes: number
  dropHits: number // 产生拦截命中的规则数
  collectedAt: string
}
export interface FirewallStatus {
  available: boolean // iptables 是否可用
  enabled: boolean // 是否有规则（防火墙启用）
  defaultPolicies: { chain: string; policy: string }[]
  ruleCount: number
}
export interface ListeningPort {
  protocol: 'tcp' | 'udp'
  address: string // 监听地址（如 0.0.0.0:22）
  port: number
  process: string // 关联进程名
  pid: number
}
export interface NetworkConnection {
  protocol: string
  localAddress: string
  localPort: number
  remoteAddress: string
  remotePort: number
  state: string // ESTABLISHED / LISTEN / TIME_WAIT ...
  process: string
  bytesIn?: number // 累计接收字节（可选）
  bytesOut?: number // 累计发送字节（可选）
}
export interface FirewallCollectResult {
  assetId: string
  host: string
  collectedAt: string
  status: FirewallStatus
  rules: FirewallRule[]
  ports: ListeningPort[]
  connections: NetworkConnection[]
  traffic?: FirewallTraffic
}
export interface AddFirewallRuleInput {
  chain: string
  protocol?: string // 可选（all / tcp / udp / icmp）
  source?: string
  destination?: string
  port?: string
  inInterface?: string
  action: string
  comment?: string
}

// —— AI 大模型配置 ——
export interface AiConfig {
  /** 服务端 API 基础地址（如 https://api.openai.com/v1） */
  baseUrl: string
  /** 加密后的 API Key */
  apiKeyEnc?: string
  /** 模型名称（如 gpt-4o-mini、deepseek-chat、qwen-plus） */
  model: string
  /** 功能是否启用 */
  enabled: boolean
  /** 供应商标识（openai/deepseek/qwen/doubao/zhipu/kimi/ollama 等，用于兼容层路由） */
  provider?: string
  /** 采样温度 0-1（默认 0.4） */
  temperature?: number
}

/** AI 供应商预设（前端展示 + 兼容层路由依据） */
export interface AiProviderDef {
  id: string
  label: string
  baseUrl: string
  models: string[]
  /** bearer=标准 Authorization 头；none=本地模型无需鉴权（Ollama） */
  authType: 'bearer' | 'none'
}

// —— AI 智能体（角色化运维专家） ——
export interface AiAgent {
  id: string
  name: string
  role: string // 角色标题（如「故障排查专家」）
  description: string
  systemPrompt: string
  /** 图标标识（前端映射，如 troubleshoot / patrol / deploy / log / qa / risk / security） */
  icon?: string
  enabled: boolean
  createdAt: string
}

// —— 服务巡检（进程 / 端口 / systemd 服务存活检测 + 自愈）——
export interface ServiceCheckResult {
  alive: boolean
  detail: string
  checkedAt: string
  /** 自愈动作是否已执行（autoHeal 开启且检测失败时） */
  healed?: boolean
  healDetail?: string
}
export interface ServiceCheck {
  id: string
  name: string
  /** 关联资产 id */
  assetId: string
  /** 检查类型：进程存活 / 端口连通 / systemd 服务状态 */
  checkType: 'process' | 'port' | 'systemd'
  /** 进程名或 systemd 服务名 */
  serviceName: string
  /** port 检查的 TCP 端口 */
  port?: number
  /** 期望状态：true=应存活（异常告警），false=应停止（残留告警） */
  expectAlive: boolean
  /** 检测失败时自动执行 systemctl restart 自愈 */
  autoHeal: boolean
  enabled: boolean
  lastResult?: ServiceCheckResult
  createdAt: string
}
