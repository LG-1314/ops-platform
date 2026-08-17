import { memoryStore } from '../store/memoryStore'
import type {
  ClusterInfo,
  ClusterDetail,
  ClusterNode,
  ClusterWorkload,
  AgentStatus,
} from '@shared/types'

export const clusterService = {
  list(): ClusterInfo[] {
    return memoryStore.getClusters()
  },

  detail(id: string): ClusterDetail {
    const cluster = memoryStore.getClusters().find((c) => c.id === id)
    if (!cluster) throw new Error('cluster not found')
    return buildDetail(cluster)
  },

  /** 集群扫描（占位：返回合成的节点/工作负载/智能体健康） */
  scan(id: string): ClusterDetail {
    const cluster = memoryStore.getClusters().find((c) => c.id === id)
    if (!cluster) throw new Error('cluster not found')
    return buildDetail(cluster)
  },

  create(partial: Partial<ClusterInfo>): ClusterInfo {
    const c: ClusterInfo = {
      id: partial.id || `cluster-${Date.now().toString(36)}`,
      name: partial.name || '未命名集群',
      endpoint: partial.endpoint || '',
      connected: partial.connected ?? false,
      nodeCount: partial.nodeCount ?? 0,
      healthScore: partial.healthScore ?? 0,
      status: partial.status || 'unknown',
    }
    return memoryStore.addCluster(c)
  },
}

function buildDetail(cluster: ClusterInfo): ClusterDetail {
  const count = Math.max(cluster.nodeCount, 3)
  const nodes: ClusterNode[] = Array.from({ length: count }, (_, i) => ({
    name: `node-${i + 1}`,
    ready: i !== 2,
    role: i === 0 ? 'control-plane' : 'worker',
    cpu: `${20 + i * 10}%`,
    memory: `${30 + i * 5}%`,
  }))
  const workloads: ClusterWorkload[] = [
    { name: 'nginx', namespace: 'default', kind: 'Deployment', status: 'Running', replicas: '3/3' },
    { name: 'api-server', namespace: 'prod', kind: 'Deployment', status: 'Running', replicas: '2/2' },
  ]
  const agents: AgentStatus[] = [
    { name: 'jarvis', role: 'orchestrator', status: 'ok' },
    { name: 'atlas', role: 'cluster-ops', status: 'ok' },
  ]
  return { cluster, nodes, workloads, agents }
}
