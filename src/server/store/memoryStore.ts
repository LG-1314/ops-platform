import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { hostname } from 'node:os'
import type {
  Asset,
  Alert,
  PatrolTask,
  Incident,
  ClusterInfo,
  Credential,
  AlertRule,
  DbConnection,
  CloudAccount,
  CloudChangeLog,
  CloudResource,
  NotificationChannel,
  CicdPipeline,
  KnowledgeHit,
  GuardrailRun,
  DoloresRun,
  UserAccount,
  ServiceCheck,
  AiConfig,
  AiAgent,
} from '@shared/types'
import { loadStore, schedulePersist, persistNow, getLoadOutcome } from './persist'
import { metricSeriesStore } from './metricSeriesStore'
import { healthStore } from './healthHistoryStore'
import { encrypt } from '../utils/crypto'
import { hashPassword } from '../services/authService'
import { logger } from '../utils/logger'

// 进程内内存存储 + 文件持久化（重启不丢）。SQLite 后续替换点。单例。
interface Store {
  assets: Asset[]
  alerts: Alert[]
  patrols: PatrolTask[]
  incidents: Incident[]
  clusters: ClusterInfo[]
  credentials: Credential[]
  alertRules: AlertRule[]
  dbConnections: DbConnection[]
  cloudAccounts: CloudAccount[]
  notificationChannels: NotificationChannel[]
  cicdPipelines: CicdPipeline[]
  knowledge: KnowledgeHit[]
  guardrailRuns: GuardrailRun[]
  doloresRuns: DoloresRun[]
  users: UserAccount[]
  serviceChecks: ServiceCheck[]
  cloudChanges: CloudChangeLog[]
  cloudSnapshots: Record<string, CloudResource[]>
  aiConfig?: AiConfig
  aiAgents?: AiAgent[]
}

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

const store: Store = {
  assets: [],
  alerts: [],
  patrols: [],
  incidents: [],
  clusters: [],
  credentials: [],
  alertRules: [],
  dbConnections: [],
  cloudAccounts: [],
  notificationChannels: [],
  cicdPipelines: [],
  knowledge: [],
  guardrailRuns: [],
  doloresRuns: [],
  users: [],
  aiAgents: [],
  serviceChecks: [],
  cloudChanges: [],
  cloudSnapshots: {},
}

function seed(): void {
  const now = new Date().toISOString()

  store.assets.push({
    id: 'asset-localhost',
    name: `本机 (${hostname()})`,
    type: 'server',
    host: hostname(),
    ip: '127.0.0.1',
    source: 'auto',
    tags: ['local', os.platform(), os.arch()],
    createdAt: now,
    healthScore: 92,
    status: 'ok',
    lastScanAt: now,
  })

  // 演示数据（web-01/db-01/gw-01 假主机及其告警/巡检/事故）仅在开发预览模式播种：
  // 正式版首次启动应为空台账，避免演示资产污染真实监控与健康分。
  if (process.env.NODE_ENV !== 'production') seedDemoData(now)

  // 默认管理员账号（RBAC）：admin / admin123，首次登录强制改密
  if (store.users.length === 0) {
    store.users.push({
      id: genId('user'),
      username: 'admin',
      displayName: '系统管理员',
      role: 'admin',
      passwordHash: hashPassword('admin123'),
      createdAt: now,
      mustChangePassword: true,
    })
  }

  // 预置 AI 智能体（角色化运维专家）：新装即开箱可用，可编辑 / 增删 / 启停
  if (store.aiAgents === undefined || store.aiAgents.length === 0) {
    store.aiAgents = seedAiAgents(now)
  }
}

/** 开发预览用的演示数据（正式版不播种）。 */
function seedDemoData(now: string): void {
  store.assets.push(
    {
      id: 'web-01',
      name: 'web-01',
      type: 'server',
      host: 'web-01',
      ip: '10.0.1.11',
      source: 'manual',
      tags: ['web', 'nginx'],
      createdAt: now,
      healthScore: 88,
      status: 'ok',
      lastScanAt: now,
    },
    {
      id: 'db-01',
      name: 'db-01',
      type: 'database',
      host: 'db-01',
      ip: '10.0.2.21',
      source: 'manual',
      tags: ['mysql', 'core'],
      createdAt: now,
      healthScore: 64,
      status: 'warn',
      lastScanAt: now,
    },
    {
      id: 'gw-01',
      name: 'gw-01',
      type: 'network',
      host: 'gw-01',
      ip: '10.0.0.1',
      source: 'manual',
      tags: ['gateway'],
      createdAt: now,
      healthScore: 95,
      status: 'ok',
      lastScanAt: now,
    }
  )

  store.alerts.push(
    {
      id: 'alert-1',
      level: 'P1',
      title: 'db-01 内存使用率偏高',
      assetId: 'db-01',
      message: '内存使用率 91%，接近阈值',
      currentValue: 91,
      threshold: 90,
      unit: '%',
      state: 'active',
      createdAt: now,
    },
    {
      id: 'alert-2',
      level: 'P2',
      title: 'web-01 磁盘空间预警',
      assetId: 'web-01',
      message: '系统盘使用率 82%',
      currentValue: 82,
      threshold: 80,
      unit: '%',
      state: 'ack',
      createdAt: now,
      ackedBy: 'ops',
    }
  )

  store.patrols.push({
    id: 'patrol-basic',
    name: '每日基础巡检',
    layers: ['basic'],
    cron: '0 2 * * *',
    enabled: true,
    status: 'idle',
    history: [],
  })

  store.incidents.push({
    id: 'inc-1',
    title: 'db-01 内存告警',
    state: 'investigating',
    level: 'P1',
    assetId: 'db-01',
    assignee: 'ops',
    createdAt: now,
    updatedAt: now,
    relatedKnowledge: ['内存不足 OOM 进程被杀'],
  })
}

function seedAiAgents(now: string): AiAgent[] {
  return [
    {
      id: 'agent-troubleshoot',
      name: '故障排查专家',
      role: '故障根因定位',
      description: '解析告警 / 系统报错 / 主机故障，定位根因并输出标准化排查步骤与安全修复命令',
      icon: 'troubleshoot',
      enabled: true,
      createdAt: now,
      systemPrompt:
        '你是「运维全维度管理平台」的故障排查专家。收到故障现象/告警/日志后：① 按概率排序列出最可能根因；② 给出 step-by-step 排查命令与步骤；③ 给出安全处置方案与命令；④ 高危操作必须提醒生产审批。回答使用简体中文，专业、简洁、可执行。',
    },
    {
      id: 'agent-patrol',
      name: '巡检分析师',
      role: '巡检报告与整改建议',
      description: '对巡检结果智能评级、风险归类，自动生成结构化巡检报告与整改清单',
      icon: 'patrol',
      enabled: true,
      createdAt: now,
      systemPrompt:
        '你是平台巡检分析师。收到巡检结果/资产数据后：① 对整体健康评级（优/良/中/差）并说明理由；② 按风险优先级列出需整改项；③ 给出整改清单与长期优化建议；④ 生成可直接用于团队汇报的结构化报告。使用简体中文。',
    },
    {
      id: 'agent-deploy',
      name: '部署配置专家',
      role: '脚本与配置生成',
      description: '生成部署脚本、服务配置、启停命令，支持自然语言对话式运维操作',
      icon: 'deploy',
      enabled: true,
      createdAt: now,
      systemPrompt:
        '你是部署配置专家。根据用户需求生成：部署脚本（bash/systemd/docker-compose）、服务配置文件、启停命令、参数调优建议。生成的命令要安全、可注释、符合最佳实践；涉及生产环境要提示先走审批。使用简体中文。',
    },
    {
      id: 'agent-log',
      name: '日志清洗分析师',
      role: '日志分析与异常归类',
      description: '清洗海量运维日志、过滤噪声、精准定位异常并归类故障类型、统计频次',
      icon: 'log',
      enabled: true,
      createdAt: now,
      systemPrompt:
        '你是日志清洗分析师。收到日志片段后：① 过滤无效/重复/噪声日志；② 提取关键异常并归类故障类型；③ 统计异常频次；④ 输出日志分析报告与处理建议。若日志含敏感信息（密钥/口令）要标注脱敏提示。使用简体中文。',
    },
    {
      id: 'agent-risk',
      name: '资源风险预判师',
      role: '容量趋势与过载预警',
      description: '基于主机 / 集群 / 云资源使用率趋势，预判内存、磁盘、负载、带宽过载风险',
      icon: 'risk',
      enabled: true,
      createdAt: now,
      systemPrompt:
        '你是资源风险预判师。收到资源使用率数据后：① 判断内存/磁盘/负载/带宽是否存在过载风险；② 给出风险等级与预计恶化时间；③ 给出扩容/优化建议与预警阈值设置建议。使用简体中文。',
    },
    {
      id: 'agent-security',
      name: '安全审计员',
      role: '变更防呆与安全审计',
      description: '审核变更命令 / 配置，识别危险操作与敏感信息，输出安全审计意见',
      icon: 'security',
      enabled: true,
      createdAt: now,
      systemPrompt:
        '你是安全审计员。对变更命令/配置进行安全审计：① 识别危险命令（rm -rf /、删库、格式化、chmod 777 等）与敏感信息泄露；② 给出风险等级；③ 给出安全替代方案；④ 提示生产环境需审批。使用简体中文。',
    },
  ]
}

// 初始化：有持久化文件则合并加载，否则播种并落盘
const persisted = loadStore()
if (persisted && typeof persisted === 'object') {
  const p = persisted as Partial<Store>
  store.assets = p.assets ?? []
  store.alerts = p.alerts ?? []
  store.patrols = p.patrols ?? []
  store.incidents = p.incidents ?? []
  store.clusters = p.clusters ?? []
  store.credentials = p.credentials ?? []
  store.alertRules = p.alertRules ?? []
  store.dbConnections = p.dbConnections ?? []
  store.cloudAccounts = p.cloudAccounts ?? []
  store.notificationChannels = p.notificationChannels ?? []
  store.cicdPipelines = p.cicdPipelines ?? []
  store.knowledge = p.knowledge ?? []
  store.guardrailRuns = p.guardrailRuns ?? []
  store.doloresRuns = p.doloresRuns ?? []
  store.users = p.users ?? []
  store.serviceChecks = p.serviceChecks ?? []
  store.cloudChanges = p.cloudChanges ?? []
  store.cloudSnapshots = p.cloudSnapshots ?? {}
  store.aiConfig = p.aiConfig
  // 老版本数据升级：无 AI 智能体时播种预置专家
  store.aiAgents = p.aiAgents && p.aiAgents.length ? p.aiAgents : seedAiAgents(new Date().toISOString())

  // 一次性迁移（正式版）：清除历史版本播种的演示数据。按固定种子 ID 精确匹配，
  // 用户自建的任何数据都不受影响；已清除过后重复运行是无操作（幂等）。
  if (process.env.NODE_ENV === 'production') {
    const demoAssets = new Set(['web-01', 'db-01', 'gw-01'])
    const before = { assets: store.assets.length, alerts: store.alerts.length, patrols: store.patrols.length, incidents: store.incidents.length }
    store.assets = store.assets.filter((a) => !demoAssets.has(a.id))
    store.alerts = store.alerts.filter((a) => a.id !== 'alert-1' && a.id !== 'alert-2' && !demoAssets.has(a.assetId ?? ''))
    store.patrols = store.patrols.filter((t) => t.id !== 'patrol-basic')
    store.incidents = store.incidents.filter((i) => i.id !== 'inc-1')
    const removed =
      before.assets - store.assets.length +
      before.alerts - store.alerts.length +
      before.patrols - store.patrols.length +
      before.incidents - store.incidents.length
    if (removed > 0) {
      logger.info(`[memoryStore] 已清理演示数据 ${removed} 条（web-01/db-01/gw-01 及其告警、演示巡检与事故）；正式版不再预置演示数据`)
    }
  }
  // 老版本数据升级：无任何用户时播种默认管理员 admin/admin123
  if (store.users.length === 0) {
    store.users.push({
      id: genId('user'),
      username: 'admin',
      displayName: '系统管理员',
      role: 'admin',
      passwordHash: hashPassword('admin123'),
      createdAt: new Date().toISOString(),
      mustChangePassword: true,
    })
  }
  // 旧数据迁移：历史版本对 K8s 集群一律 skipTLSVerify，升级后默认开启校验；
  // 存量集群保持旧行为（标记为跳过校验），由用户在编辑集群时显式关闭。
  for (const c of store.clusters) {
    if (c.insecureSkipTlsVerify === undefined) c.insecureSkipTlsVerify = true
  }
  // 旧数据迁移：历史版本曾明文存通知渠道签名密钥，此处一次性加密为 secretEnc（不落明文）。
  // 加密失败（如密钥文件不可写）时保留明文字段，下次启动重试迁移；绝不先删明文再失败。
  for (const c of store.notificationChannels) {
    if (c.secret && !c.secretEnc) {
      try {
        c.secretEnc = encrypt(c.secret)
        delete c.secret
      } catch (e) {
        logger.error(`[memoryStore] 通知渠道签名密钥迁移加密失败，保留明文待重试：${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }
  schedulePersist(store)
} else {
  // 播种即代表当前没有可用数据。若此前存在数据文件（损坏/无法解析），
  // 属于数据丢失事故：响亮记录 + 留存告警文件，绝不能只默默回到默认账号。
  const outcome = getLoadOutcome()
  if (outcome === 'corrupt') {
    logger.error('[memoryStore] store.json 及其备份均无法读取，已隔离坏文件并以初始数据启动；请检查数据目录下的 *.corrupt-* 文件抢救数据')
    try {
      const dir = process.env.OPS_DATA_DIR || path.join(os.homedir(), '.ops-platform')
      fs.writeFileSync(
        path.join(dir, 'DATA_RECOVERY_WARNING.txt'),
        `${new Date().toISOString()} store.json 损坏，平台以初始数据启动。同目录 *.corrupt-* 文件为原数据，请勿删除，可联系管理员尝试人工恢复。\n`
      )
    } catch {
      /* 告警文件写失败不影响启动 */
    }
  }
  seed()
  schedulePersist(store)
}

function persist(): void {
  schedulePersist(store)
}

/** 立即落盘（进程退出前调用，确保防抖窗口内的变更不丢失）。 */
export function flushStore(): void {
  persistNow(store)
}

function upsert<T extends { id: string }>(arr: T[], item: T): T {
  const i = arr.findIndex((x) => x.id === item.id)
  if (i < 0) arr.push(item)
  else arr[i] = { ...arr[i], ...item }
  return item
}

export const memoryStore = {
  /** 立即落盘全部内存数据（退出前调用） */
  flush: flushStore,
  // 资产
  getAssets: (): Asset[] => store.assets,
  addAsset: (a: Asset): Asset => {
    store.assets.push(a)
    persist()
    return a
  },
  updateAsset: (id: string, patch: Partial<Asset>): Asset | undefined => {
    const i = store.assets.findIndex((x) => x.id === id)
    if (i < 0) return undefined
    store.assets[i] = { ...store.assets[i], ...patch, id }
    persist()
    return store.assets[i]
  },
  removeAsset: (id: string): boolean => {
    const i = store.assets.findIndex((x) => x.id === id)
    if (i < 0) return false
    store.assets.splice(i, 1)
    // 同步清理该资产的时序历史，避免已删除资产的曲线永久留在 metrics/health.json
    try {
      metricSeriesStore.dropSeries(id)
      healthStore.dropHealth('db', id)
      healthStore.dropHealth('cluster', id)
    } catch {
      /* 时序存储未初始化时忽略 */
    }
    persist()
    return true
  },

  // 告警
  getAlerts: (): Alert[] => store.alerts,
  addAlert: (a: Alert): Alert => {
    store.alerts.push(a)
    // 环形上限：告警风暴/长期运行时 store.json 不得被告警历史无限膨胀
    // （保留最新 1000 条；已解决告警可随时删除，旧告警价值随时间衰减）
    if (store.alerts.length > 1000) store.alerts.splice(0, store.alerts.length - 1000)
    persist()
    return a
  },
  updateAlert: (id: string, patch: Partial<Alert>): Alert | undefined => {
    const i = store.alerts.findIndex((x) => x.id === id)
    if (i < 0) return undefined
    store.alerts[i] = { ...store.alerts[i], ...patch, id }
    persist()
    return store.alerts[i]
  },
  removeAlert: (id: string): boolean => {
    const i = store.alerts.findIndex((x) => x.id === id)
    if (i < 0) return false
    store.alerts.splice(i, 1)
    persist()
    return true
  },

  // 巡检
  getPatrols: (): PatrolTask[] => store.patrols,
  addPatrol: (p: PatrolTask): PatrolTask => {
    store.patrols.push(p)
    persist()
    return p
  },
  updatePatrol: (id: string, patch: Partial<PatrolTask>): PatrolTask | undefined => {
    const i = store.patrols.findIndex((x) => x.id === id)
    if (i < 0) return undefined
    store.patrols[i] = { ...store.patrols[i], ...patch, id }
    persist()
    return store.patrols[i]
  },
  removePatrol: (id: string): boolean => {
    const i = store.patrols.findIndex((x) => x.id === id)
    if (i < 0) return false
    store.patrols.splice(i, 1)
    persist()
    return true
  },

  // 事故
  getIncidents: (): Incident[] => store.incidents,
  addIncident: (i: Incident): Incident => {
    store.incidents.push(i)
    persist()
    return i
  },
  updateIncident: (id: string, patch: Partial<Incident>): Incident | undefined => {
    const i = store.incidents.findIndex((x) => x.id === id)
    if (i < 0) return undefined
    store.incidents[i] = { ...store.incidents[i], ...patch, id }
    persist()
    return store.incidents[i]
  },
  removeIncident: (id: string): boolean => {
    const i = store.incidents.findIndex((x) => x.id === id)
    if (i < 0) return false
    store.incidents.splice(i, 1)
    persist()
    return true
  },

  // 集群
  getClusters: (): ClusterInfo[] => store.clusters,
  addCluster: (c: ClusterInfo): ClusterInfo => {
    const r = upsert(store.clusters, c)
    persist()
    return r
  },
  updateCluster: (id: string, patch: Partial<ClusterInfo>): ClusterInfo | undefined => {
    const i = store.clusters.findIndex((x) => x.id === id)
    if (i < 0) return undefined
    store.clusters[i] = { ...store.clusters[i], ...patch, id }
    persist()
    return store.clusters[i]
  },
  removeCluster: (id: string): boolean => {
    const i = store.clusters.findIndex((x) => x.id === id)
    if (i < 0) return false
    store.clusters.splice(i, 1)
    try {
      healthStore.dropHealth('cluster', id)
    } catch {
      /* ignore */
    }
    persist()
    return true
  },

  // 凭据
  getCredentials: (): Credential[] => store.credentials,
  addCredential: (c: Credential): Credential => {
    store.credentials.push(c)
    persist()
    return c
  },
  updateCredential: (id: string, patch: Partial<Credential>): Credential | undefined => {
    const i = store.credentials.findIndex((x) => x.id === id)
    if (i < 0) return undefined
    store.credentials[i] = { ...store.credentials[i], ...patch, id }
    persist()
    return store.credentials[i]
  },
  removeCredential: (id: string): boolean => {
    const i = store.credentials.findIndex((x) => x.id === id)
    if (i < 0) return false
    store.credentials.splice(i, 1)
    persist()
    return true
  },

  // 告警规则
  getAlertRules: (): AlertRule[] => store.alertRules,
  addAlertRule: (r: AlertRule): AlertRule => {
    store.alertRules.push(r)
    persist()
    return r
  },
  updateAlertRule: (id: string, patch: Partial<AlertRule>): AlertRule | undefined => {
    const i = store.alertRules.findIndex((x) => x.id === id)
    if (i < 0) return undefined
    store.alertRules[i] = { ...store.alertRules[i], ...patch, id }
    persist()
    return store.alertRules[i]
  },
  removeAlertRule: (id: string): boolean => {
    const i = store.alertRules.findIndex((x) => x.id === id)
    if (i < 0) return false
    store.alertRules.splice(i, 1)
    persist()
    return true
  },

  // 数据库连接
  getDbConnections: (): DbConnection[] => store.dbConnections,
  addDbConnection: (c: DbConnection): DbConnection => {
    store.dbConnections.push(c)
    persist()
    return c
  },
  updateDbConnection: (id: string, patch: Partial<DbConnection>): DbConnection | undefined => {
    const i = store.dbConnections.findIndex((x) => x.id === id)
    if (i < 0) return undefined
    store.dbConnections[i] = { ...store.dbConnections[i], ...patch, id }
    persist()
    return store.dbConnections[i]
  },
  removeDbConnection: (id: string): boolean => {
    const i = store.dbConnections.findIndex((x) => x.id === id)
    if (i < 0) return false
    store.dbConnections.splice(i, 1)
    try {
      healthStore.dropHealth('db', id)
    } catch {
      /* ignore */
    }
    persist()
    return true
  },

  // 云账号
  getCloudAccounts: (): CloudAccount[] => store.cloudAccounts,
  addCloudAccount: (c: CloudAccount): CloudAccount => {
    store.cloudAccounts.push(c)
    persist()
    return c
  },
  updateCloudAccount: (id: string, patch: Partial<CloudAccount>): CloudAccount | undefined => {
    const i = store.cloudAccounts.findIndex((x) => x.id === id)
    if (i < 0) return undefined
    store.cloudAccounts[i] = { ...store.cloudAccounts[i], ...patch, id }
    persist()
    return store.cloudAccounts[i]
  },
  removeCloudAccount: (id: string): boolean => {
    const i = store.cloudAccounts.findIndex((x) => x.id === id)
    if (i < 0) return false
    store.cloudAccounts.splice(i, 1)
    persist()
    return true
  },

  // 云资源同步：快照 + 变更日志（日志按 200 条封顶，避免无限增长）
  getCloudSnapshot: (accountId: string): CloudResource[] | undefined => store.cloudSnapshots[accountId],
  setCloudSnapshot: (accountId: string, resources: CloudResource[]): void => {
    store.cloudSnapshots[accountId] = resources
    persist()
  },
  addCloudChanges: (changes: CloudChangeLog[]): void => {
    if (!changes.length) return
    store.cloudChanges.unshift(...changes)
    if (store.cloudChanges.length > 200) store.cloudChanges.length = 200
    persist()
  },
  getCloudChanges: (accountId?: string): CloudChangeLog[] =>
    accountId ? store.cloudChanges.filter((c) => c.accountId === accountId) : store.cloudChanges,

  // 服务巡检
  getServiceChecks: (): ServiceCheck[] => store.serviceChecks,
  addServiceCheck: (c: ServiceCheck): ServiceCheck => {
    store.serviceChecks.push(c)
    persist()
    return c
  },
  updateServiceCheck: (id: string, patch: Partial<ServiceCheck>): ServiceCheck | undefined => {
    const i = store.serviceChecks.findIndex((x) => x.id === id)
    if (i < 0) return undefined
    store.serviceChecks[i] = { ...store.serviceChecks[i], ...patch, id }
    persist()
    return store.serviceChecks[i]
  },
  removeServiceCheck: (id: string): boolean => {
    const i = store.serviceChecks.findIndex((x) => x.id === id)
    if (i < 0) return false
    store.serviceChecks.splice(i, 1)
    persist()
    return true
  },

  // 通知渠道
  getNotificationChannels: (): NotificationChannel[] => store.notificationChannels,
  addNotificationChannel: (c: NotificationChannel): NotificationChannel => {
    store.notificationChannels.push(c)
    persist()
    return c
  },
  updateNotificationChannel: (id: string, patch: Partial<NotificationChannel>): NotificationChannel | undefined => {
    const i = store.notificationChannels.findIndex((x) => x.id === id)
    if (i < 0) return undefined
    store.notificationChannels[i] = { ...store.notificationChannels[i], ...patch, id }
    persist()
    return store.notificationChannels[i]
  },
  removeNotificationChannel: (id: string): boolean => {
    const i = store.notificationChannels.findIndex((x) => x.id === id)
    if (i < 0) return false
    store.notificationChannels.splice(i, 1)
    persist()
    return true
  },

  // CI/CD 流水线（真实台账，可增删改，替代早期硬编码示例数据）
  getCicdPipelines: (): CicdPipeline[] => store.cicdPipelines,
  addCicdPipeline: (p: CicdPipeline): CicdPipeline => {
    const r = upsert(store.cicdPipelines, p)
    persist()
    return r
  },
  updateCicdPipeline: (id: string, patch: Partial<CicdPipeline>): CicdPipeline | undefined => {
    const i = store.cicdPipelines.findIndex((x) => x.id === id)
    if (i < 0) return undefined
    store.cicdPipelines[i] = { ...store.cicdPipelines[i], ...patch, id }
    persist()
    return store.cicdPipelines[i]
  },
  removeCicdPipeline: (id: string): boolean => {
    const i = store.cicdPipelines.findIndex((x) => x.id === id)
    if (i < 0) return false
    store.cicdPipelines.splice(i, 1)
    persist()
    return true
  },

  // 自维护知识库（持久化，替代早期裸内存数组）
  getKnowledge: (): KnowledgeHit[] => store.knowledge,
  addKnowledge: (k: KnowledgeHit): KnowledgeHit => {
    const r = upsert(store.knowledge, k)
    persist()
    return r
  },
  updateKnowledge: (id: string, patch: Partial<KnowledgeHit>): KnowledgeHit | undefined => {
    const i = store.knowledge.findIndex((x) => x.id === id)
    if (i < 0) return undefined
    store.knowledge[i] = { ...store.knowledge[i], ...patch, id }
    persist()
    return store.knowledge[i]
  },
  removeKnowledge: (id: string): boolean => {
    const i = store.knowledge.findIndex((x) => x.id === id)
    if (i < 0) return false
    store.knowledge.splice(i, 1)
    persist()
    return true
  },

  // Guardrails 防呆检查历史（最新在前，最多保留 100 条）
  getGuardrailRuns: (): GuardrailRun[] => store.guardrailRuns,
  addGuardrailRun: (r: GuardrailRun): GuardrailRun => {
    store.guardrailRuns.unshift(r)
    if (store.guardrailRuns.length > 100) store.guardrailRuns.length = 100
    persist()
    return r
  },

  // Dolores 工具箱执行历史（最新在前，最多保留 100 条）
  getDoloresRuns: (): DoloresRun[] => store.doloresRuns,
  addDoloresRun: (r: DoloresRun): DoloresRun => {
    store.doloresRuns.unshift(r)
    if (store.doloresRuns.length > 100) store.doloresRuns.length = 100
    persist()
    return r
  },

  // 用户账号（RBAC）
  getUsers: (): UserAccount[] => store.users,
  addUser: (u: UserAccount): UserAccount => {
    store.users.push(u)
    persist()
    return u
  },
  updateUser: (id: string, patch: Partial<UserAccount>): UserAccount | undefined => {
    const i = store.users.findIndex((x) => x.id === id)
    if (i < 0) return undefined
    store.users[i] = { ...store.users[i], ...patch, id }
    persist()
    return store.users[i]
  },
  removeUser: (id: string): boolean => {
    const i = store.users.findIndex((x) => x.id === id)
    if (i < 0) return false
    // 禁止删除最后一个管理员，避免平台失去管理入口
    const target = store.users[i]
    if (target.role === 'admin' && store.users.filter((x) => x.role === 'admin').length <= 1) {
      return false
    }
    store.users.splice(i, 1)
    persist()
    return true
  },

  // AI 大模型配置（apiKey 加密存储，绝不明文落盘）
  getAiConfig: (): AiConfig | undefined => store.aiConfig,
  setAiConfig: (cfg: AiConfig): AiConfig => {
    store.aiConfig = cfg
    persist()
    return cfg
  },

  // AI 智能体（角色化运维专家）
  getAiAgents: (): AiAgent[] => store.aiAgents || [],
  addAiAgent: (a: AiAgent): AiAgent => {
    const list = store.aiAgents || []
    list.push(a)
    store.aiAgents = list
    persist()
    return a
  },
  updateAiAgent: (id: string, patch: Partial<AiAgent>): AiAgent | undefined => {
    const list = store.aiAgents || []
    const i = list.findIndex((x) => x.id === id)
    if (i < 0) return undefined
    list[i] = { ...list[i], ...patch, id }
    store.aiAgents = list
    persist()
    return list[i]
  },
  removeAiAgent: (id: string): boolean => {
    const list = store.aiAgents || []
    const i = list.findIndex((x) => x.id === id)
    if (i < 0) return false
    list.splice(i, 1)
    store.aiAgents = list
    persist()
    return true
  },
}

export type { Store }
