// knowledge.mjs — 内置运维 FAQ 知识库 + 资产/项目关联检索（"可查资料和相关项目"模块核心）
// 后续可替换为对接运维监控FAQ知识库的真实检索接口，接口签名保持不变。

const FAQ = [
  {
    q: '磁盘空间不足 磁盘满 清理',
    a: '1) df -h 定位占用分区；2) du -sh /* 找大目录；3) 清理日志/缓存（/var/log、npm cache 等）；4) 确认无重要数据后扩容或归档。',
    tags: ['disk', '磁盘', '空间'],
  },
  {
    q: 'CPU 使用率过高 负载高',
    a: '1) top/htop 找高 CPU 进程；2) 判断是否业务高峰；3) 排查死循环/频繁 GC；4) 必要时限流或扩容。',
    tags: ['cpu', '负载', '性能'],
  },
  {
    q: '内存不足 OOM 进程被杀',
    a: '1) free -m 看 available；2) dmesg | grep OOM 确认；3) 排查内存泄漏；4) 增加 swap 或扩容内存。',
    tags: ['memory', '内存', 'oom'],
  },
  {
    q: '网络不通 丢包 延迟高',
    a: '1) ping 网关/目标；2) traceroute 定位跳点；3) 检查防火墙/路由；4) 查网卡速率与错误包。',
    tags: ['network', '网络', '丢包'],
  },
  {
    q: '服务启动失败 systemctl',
    a: '1) systemctl status <svc>；2) journalctl -u <svc> 看日志；3) 检查配置/端口/依赖；4) 修复后重启。',
    tags: ['service', '服务', 'systemd'],
  },
  {
    q: '时间不对 NTP 时间同步',
    a: '1) timedatectl 看状态；2) 配置 chrony/ntpd；3) 手动 ntpdate 校准；4) 检查时区设置。',
    tags: ['time', 'ntp', '时间'],
  },
]

// 资产 ↔ 项目 ↔ 工单 ↔ 知识 的关联数据（示例，后续可来自 CMDB/工单系统）
const PROJECTS = [
  { asset: 'web-01', project: '官网重构', ticket: 'OPS-1024', knowledge: '磁盘满清理', note: '承载官网静态资源，磁盘敏感' },
  { asset: 'db-01', project: '核心交易库', ticket: 'OPS-0871', knowledge: 'OOM 排查', note: '主库，内存敏感' },
  { asset: 'gw-01', project: '统一网关', ticket: 'OPS-1102', knowledge: '网络不通排查', note: '入口网关，网络敏感' },
]

export function searchKnowledge(query) {
  const q = (query || '').toLowerCase().trim()
  if (!q) return []
  const words = q.split(/\s+/)
  return FAQ.filter(
    (f) =>
      f.q.toLowerCase().includes(q) ||
      f.tags.some((t) => q.includes(t.toLowerCase())) ||
      words.some((w) => f.q.toLowerCase().includes(w))
  )
}

export function relatedProjects(asset) {
  if (!asset) return PROJECTS
  const a = asset.toLowerCase()
  return PROJECTS.filter((p) => p.asset.toLowerCase().includes(a) || a.includes(p.asset.toLowerCase()))
}
