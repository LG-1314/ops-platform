import type { KubeConfig, CoreV1Api, AppsV1Api } from '@kubernetes/client-node'
import type { ClusterInfo, ClusterDetail, K8sNodeInfo, K8sWorkloadInfo, Status } from '@shared/types'
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

/** 连接集群并拉取节点/工作负载真实数据；失败抛出清晰错误（路由层转译为可读提示）。 */
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

  const nodes: K8sNodeInfo[] = (nodeRes.items || []).map((n) => {
    const ready =
      n.status?.conditions?.some((c) => c.type === 'Ready' && c.status === 'True') ?? false
    const role =
      (n.metadata?.labels?.['kubernetes.io/role'] as string) ||
      (n.metadata?.labels?.['node-role.kubernetes.io/control-plane']
        ? 'control-plane'
        : 'worker')
    const status: Status = ready ? 'ok' : 'error'
    return {
      name: n.metadata?.name || '',
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

  const readyCount = nodes.filter((n) => n.ready).length
  const connected = nodes.length > 0
  const healthScore = nodes.length ? Math.round((readyCount / nodes.length) * 100) : 0
  const status: Status = !connected ? 'unknown' : readyCount === nodes.length ? 'ok' : 'warn'

  return {
    cluster: { ...cluster, connected, nodeCount: nodes.length, healthScore, status },
    nodes,
    workloads,
    agents: [],
  }
}
