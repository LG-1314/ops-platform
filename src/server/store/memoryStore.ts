import os from 'node:os'
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
  NotificationChannel,
  CicdPipeline,
  KnowledgeHit,
  GuardrailRun,
  DoloresRun,
  UserAccount,
} from '@shared/types'
import { loadStore, schedulePersist, persistNow } from './persist'
import { encrypt } from '../utils/crypto'
import { hashPassword } from '../services/authService'

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
}

function seed(): void {
  const now = new Date().toISOString()

  store.assets.push(
    {
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
    },
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
      state: 'active',
      createdAt: now,
    },
    {
      id: 'alert-2',
      level: 'P2',
      title: 'web-01 磁盘空间预警',
      assetId: 'web-01',
      message: '系统盘使用率 82%',
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

  // 注：不再预置「生产集群」种子。无凭据/不可达的占位集群会让用户点详情必 502，
  // 改为由用户自行录入真实集群（关联凭据或提供 kubeconfig）后，详情页才会真实连接。

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
  // 旧数据迁移：历史版本曾明文存通知渠道签名密钥，此处一次性加密为 secretEnc（不落明文）。
  for (const c of store.notificationChannels) {
    if (c.secret && !c.secretEnc) {
      c.secretEnc = encrypt(c.secret)
      delete c.secret
    }
  }
  schedulePersist(store)
} else {
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
    persist()
    return true
  },

  // 告警
  getAlerts: (): Alert[] => store.alerts,
  addAlert: (a: Alert): Alert => {
    store.alerts.push(a)
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
}

export type { Store }
