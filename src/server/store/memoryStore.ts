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
} from '@shared/types'
import { loadStore, schedulePersist } from './persist'

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

  store.clusters.push({
    id: 'cluster-prod',
    name: '生产集群',
    endpoint: 'https://k8s-prod.internal',
    connected: false,
    nodeCount: 0,
    healthScore: 0,
    status: 'unknown',
  })
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
} else {
  seed()
  schedulePersist(store)
}

function persist(): void {
  schedulePersist(store)
}

function upsert<T extends { id: string }>(arr: T[], item: T): T {
  const i = arr.findIndex((x) => x.id === item.id)
  if (i < 0) arr.push(item)
  else arr[i] = { ...arr[i], ...item }
  return item
}

export const memoryStore = {
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

  // 集群
  getClusters: (): ClusterInfo[] => store.clusters,
  addCluster: (c: ClusterInfo): ClusterInfo => {
    const r = upsert(store.clusters, c)
    persist()
    return r
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
}

export type { Store }
