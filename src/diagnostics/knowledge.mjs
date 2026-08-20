// knowledge.mjs — 内置运维 FAQ 知识库 + 资产/项目关联检索（"可查资料和相关项目"模块核心）
// 纯本地静态知识库：覆盖磁盘/CPU/内存/网络/服务/进程/数据库/容器/证书/安全等高频场景。
// 后续可替换为对接运维监控FAQ知识库的真实检索接口，接口签名保持不变。

/**
 * 内置 FAQ 条目。
 * - id：稳定标识，供 /knowledge/:id 详情接口直接命中（不再依赖运行期生成的 kb-N）。
 * - title：人类可读标题（不再截断）。
 * - keywords：检索关键词（含中英文别名、同义词、报错片段），提升召回率。
 * - tags：分类标签，用于筛选与展示。
 * - a：可执行的排查/解决步骤（结构化、step-by-step）。
 */
const FAQ = [
  {
    id: 'kb-disk-full',
    title: '磁盘空间不足 / 磁盘写满',
    keywords: ['磁盘空间不足', '磁盘满', '磁盘写满', 'disk full', 'no space left', '清理', 'df', 'inode'],
    tags: ['disk', '磁盘', '空间'],
    a: '1) df -h 定位占用分区；2) df -i 看 inode 是否耗尽（小文件过多会占满 inode）；3) du -sh /* 逐层找大目录；4) 清理日志/缓存（/var/log、npm cache、docker 悬挂镜像）；5) 确认无重要数据后扩容或归档。',
  },
  {
    id: 'kb-cpu-high',
    title: 'CPU 使用率过高 / 负载高',
    keywords: ['CPU 使用率过高', '负载高', 'cpu high', 'load average', 'top', '死循环', '进程占用'],
    tags: ['cpu', '负载', '性能'],
    a: '1) top/htop 找高 CPU 进程；2) 判断是否业务高峰；3) 排查死循环/频繁 GC/异常线程；4) 必要时限流、降级或扩容；5) 长期高负载需复核实例规格。',
  },
  {
    id: 'kb-mem-oom',
    title: '内存不足 / OOM 进程被杀',
    keywords: ['内存不足', 'OOM', '进程被杀', 'out of memory', '内存泄漏', 'free', 'swap'],
    tags: ['memory', '内存', 'oom'],
    a: '1) free -m 看 available；2) dmesg | grep -i oom 确认 OOM；3) 排查内存泄漏（堆 dump、valgrind）；4) 增加 swap 临时缓解或扩容内存；5) 调整应用 JVM/运行时堆上限。',
  },
  {
    id: 'kb-net-unreach',
    title: '网络不通 / 丢包 / 延迟高',
    keywords: ['网络不通', '丢包', '延迟高', 'ping', 'traceroute', 'network unreachable', '防火墙'],
    tags: ['network', '网络', '丢包'],
    a: '1) ping 网关/目标；2) traceroute/mtr 定位跳点；3) 检查防火墙/安全组/路由表；4) 查网卡速率与错误包（ethtool/ip -s link）；5) 跨可用区/跨云需检查对等连接与带宽。',
  },
  {
    id: 'kb-svc-fail',
    title: '服务启动失败 / systemctl 异常',
    keywords: ['服务启动失败', 'systemctl', 'failed', '端口占用', 'Unit not found', '启动报错'],
    tags: ['service', '服务', 'systemd'],
    a: '1) systemctl status <svc> 看状态；2) journalctl -u <svc> -n 100 看日志；3) 检查配置/端口冲突/依赖（Requires/After）；4) 修复后 systemctl daemon-reload && restart；5) 开机自启用 enable。',
  },
  {
    id: 'kb-time-ntp',
    title: '时间不对 / NTP 时间同步',
    keywords: ['时间不对', 'NTP', '时间同步', 'clock', '时间偏移', '证书报错'],
    tags: ['time', 'ntp', '时间'],
    a: '1) timedatectl 看状态；2) 配置 chrony/ntpd 并 enable；3) 手动 ntpdate -u <server> 校准；4) 检查时区（timedatectl set-timezone）；5) 时间偏差过大会导致证书/Token 校验失败。',
  },
  {
    id: 'kb-mysql-slow',
    title: 'MySQL 慢查询 / 连接数打满',
    keywords: ['mysql 慢查询', 'too many connections', '连接数打满', '慢SQL', '索引', 'show processlist'],
    tags: ['mysql', '数据库', '性能'],
    a: '1) show processlist 看长事务/锁等待；2) 开启 slow log 定位慢 SQL；3) 加索引/改写 SQL；4) 调大 max_connections 或加连接池；5) 死锁用 SHOW ENGINE INNODB STATUS 排查。',
  },
  {
    id: 'kb-mysql-replica',
    title: 'MySQL 主从延迟 / 复制中断',
    keywords: ['主从延迟', 'replica lag', '复制中断', 'Slave_SQL_Running', 'IO线程', 'binlog'],
    tags: ['mysql', '复制', '数据库'],
    a: '1) show slave status 看 Seconds_Behind_Master 与双线程状态；2) IO 线程断查网络/账号/binlog 位点；3) SQL 线程错查冲突事务，可跳过或重做；4) 大事务/批量写入会放大延迟，错峰执行。',
  },
  {
    id: 'kb-pg-conn',
    title: 'PostgreSQL 连接耗尽 / 锁等待',
    keywords: ['postgres 连接耗尽', 'too many connections', 'pg 锁等待', 'deadlock', 'pg_stat_activity'],
    tags: ['postgres', '数据库', '锁'],
    a: '1) select * from pg_stat_activity 看空闲连接；2) 调大 max_connections 或减 idle 超时；3) 锁等待查 pg_locks + pg_stat_activity；4) 死锁会自动回滚一方，应用需重试；5) 用连接池（pgbouncer）复用。',
  },
  {
    id: 'kb-redis-mem',
    title: 'Redis 内存暴涨 / 键过期失效',
    keywords: ['redis 内存', 'used_memory', '键过期', 'evicted', 'maxmemory', '缓存击穿'],
    tags: ['redis', '缓存', '内存'],
    a: '1) info memory 看 used_memory 与碎片率；2) 设 maxmemory + 淘汰策略（allkeys-lru）；3) 大 key 用 --bigkeys 扫描并拆分；4) 缓存击穿用空值缓存/互斥锁；5) 持久化 RDB/AOF 异常查磁盘与 fork 耗时。',
  },
  {
    id: 'kb-k8s-pod-crash',
    title: 'K8s Pod CrashLoopBackOff / OOMKilled',
    keywords: ['pod crashloopbackoff', 'oomkilled', '容器重启', 'kubectl describe', 'back-off', '镜像拉取失败'],
    tags: ['kubernetes', '容器', 'pod'],
    a: '1) kubectl describe pod 看 Events 与 Last State；2) kubectl logs --previous 看上一容器日志；3) OOMKilled 调大 resources.limits.memory；4) 镜像拉取失败查 imagePullSecret/仓库权限；5) 就绪/存活探针阈值过严会反复重启。',
  },
  {
    id: 'kb-k8s-node-notready',
    title: 'K8s 节点 NotReady / 调度失败',
    keywords: ['node notready', '节点异常', 'kubelet', '磁盘压力', '内存压力', 'taint'],
    tags: ['kubernetes', '节点', '调度'],
    a: '1) kubectl get nodes 看 STATUS 与条件；2) 登节点查 kubelet 状态与磁盘/inode 压力；3) 内存/磁盘压力会触发驱逐；4) 检查网络插件与证书有效期；5) 维护节点先 cordon+drain 再操作。',
  },
  {
    id: 'kb-docker-disk',
    title: 'Docker 磁盘占满 / 悬挂资源',
    keywords: ['docker 磁盘满', 'dangling', '悬挂镜像', 'docker system prune', 'overlay2', '日志膨胀'],
    tags: ['docker', '容器', '磁盘'],
    a: '1) docker system df 看占用；2) docker system prune 清悬挂镜像/容器/网络；3) 容器日志轮转（max-size/max-file）；4) overlay2 大目录定位到具体容器；5) 定期清理避免打满宿主磁盘。',
  },
  {
    id: 'kb-cert-expired',
    title: 'HTTPS 证书过期 / 域名不匹配',
    keywords: ['证书过期', 'certificate expired', 'ssl error', '域名不匹配', '证书链', 'tls'],
    tags: ['cert', '证书', 'tls'],
    a: '1) openssl s_client -connect host:443 看有效期与 SAN；2) 证书链不完整会报 insecure；3) 域名不匹配检查 SAN；4) 用 acme/ cert-manager 自动续期；5) 时间偏差也会导致证书"看似"失效。',
  },
  {
    id: 'kb-ssh-fail',
    title: 'SSH 连接失败 / 免密失效',
    keywords: ['ssh 连接失败', 'permission denied', '免密失效', 'connection refused', '公钥', 'known_hosts'],
    tags: ['ssh', '远程', '认证'],
    a: '1) 看错误类型：refused=端口/防火墙，denied=账号/密钥；2) 公钥失效检查 ~/.ssh/authorized_keys 权限(700/600)；3) 清 known_hosts 冲突；4) 服务端看 /var/log/secure；5) 超限频登录可能被 fail2ban 封禁。',
  },
  {
    id: 'kb-process-zombie',
    title: '僵尸进程 / 进程数打满',
    keywords: ['僵尸进程', 'zombie', 'defunct', '进程数打满', 'max user processes', 'fork bomb'],
    tags: ['process', '进程', '系统'],
    a: '1) ps aux | grep defunct 看僵尸；2) 僵尸需父进程回收或重启父进程；3) 进程数满查 ulimit -u 与 pid_max；4) fork bomb 限 cgroup/ulimit；5) 用 systemd 托管服务避免脱离回收。',
  },
  {
    id: 'kb-load-high',
    title: '系统平均负载高但 CPU 不高',
    keywords: ['负载高', 'load average', 'cpu 不高', 'io 等待', 'iowait', 'D状态'],
    tags: ['load', 'io', '性能'],
    a: '1) top 看 wa（iowait）占比；2) wa 高说明磁盘 IO 瓶颈（vmstat/iostat 定位盘）；3) 大量 D 状态进程在等 IO；4) 优化慢查询/换 SSD/加缓存；5) 网络密集也会抬升负载。',
  },
  {
    id: 'kb-swap-used',
    title: 'Swap 被大量使用 / 频繁换入换出',
    keywords: ['swap 使用', 'swappiness', '频繁换页', 'si so', '性能下降'],
    tags: ['swap', '内存', '性能'],
    a: '1) free -m 看 swap 占用；2) vmstat 看 si/so 是否持续非零；3) 调 vm.swappiness 缓解（默认 60）；4) 持续换页说明物理内存不足，优先扩容；5) 数据库/缓存类应尽量避免 swap。',
  },
  {
    id: 'kb-port-conflict',
    title: '端口被占用 / 地址已在使用',
    keywords: ['端口被占用', 'address already in use', 'eaddrinuse', 'bind 失败', '端口冲突'],
    tags: ['port', '网络', '启动'],
    a: '1) ss -ltnp | grep :端口 看占用进程；2) 杀掉冲突进程或改监听端口；3) TIME_WAIT 过多用 tw_reuse 或 SO_REUSEADDR；4) 容器端口映射冲突检查 compose；5) 程序退出未释放端口需修优雅关闭。',
  },
  {
    id: 'kb-filehandle',
    title: '文件句柄耗尽 / Too many open files',
    keywords: ['too many open files', '文件句柄耗尽', 'EMFILE', 'ulimit', 'nofile', '连接打不开'],
    tags: ['fd', '资源限制', '系统'],
    a: '1) 查当前 ulimit -n 与进程占用（ls /proc/<pid>/fd | wc -l）；2) 调大 nofile 软硬限制（/etc/security/limits.conf）；3) 代码未关闭文件/连接会泄漏；4) 反向代理与 DB 连接池需设上限；5) systemd 服务加 LimitNOFILE。',
  },
  {
    id: 'kb-dns-fail',
    title: 'DNS 解析失败 / 解析慢',
    keywords: ['dns 解析失败', 'resolve', 'name or service not known', '解析慢', 'resolv.conf'],
    tags: ['dns', '网络', '解析'],
    a: '1) nslookup/dig 看解析结果与耗时；2) 查 /etc/resolv.conf 的 nameserver；3) 解析慢换更快的 DNS 或加本地缓存（nscd/systemd-resolved）；4) 容器需检查 dnsPolicy；5) 短连接高 QPS 应做 DNS 缓存避免打满。',
  },
  {
    id: 'kb-db-backup',
    title: '数据库备份与恢复要点',
    keywords: ['数据库备份', 'mysqldump', 'pg_dump', '恢复', 'binlog', '物理备份', '时间点恢复'],
    tags: ['backup', '数据库', '容灾'],
    a: '1) 逻辑备份用 mysqldump/pg_dump，物理备份用 xtrabackup/pg_basebackup；2) 开启 binlog/WAL 支持时间点恢复；3) 备份要校验（恢复演练）；4) 异地/对象存储多副本；5) 恢复前先在隔离环境验证避免覆盖生产。',
  },
  {
    id: 'kb-api-timeout',
    title: '接口超时 / 网关 504',
    keywords: ['接口超时', '504', 'gateway timeout', '请求慢', '熔断', '后端无响应'],
    tags: ['api', '网关', '性能'],
    a: '1) 看是单接口还是全局，定位慢依赖；2) 加超时与熔断（防止雪崩）；3) 查下游 DB/缓存/第三方响应；4) 慢查询加索引/缓存；5) 网关与上游超时需对齐，避免上游已断网关仍等。',
  },
  {
    id: 'kb-log-rota',
    title: '日志暴增 / 磁盘被日志吃满',
    keywords: ['日志暴增', '日志满', 'logrotate', '日志轮转', '磁盘告警', 'debug 日志'],
    tags: ['log', '磁盘', '运维'],
    a: '1) du 定位大日志文件；2) 配 logrotate（size + rotate 数量）；3) 应用层设合理级别（生产关 debug）；4) 容器配 logging max-size；5) 集中采集（ELK/Loki）并设保留期。',
  },
  {
    id: 'kb-firewall',
    title: '防火墙 / 安全组误拦',
    keywords: ['防火墙', 'iptables', '安全组', 'firewalld', '端口不通', '被拦', 'ufw'],
    tags: ['firewall', '安全', '网络'],
    a: '1) 确认目标端口在防火墙/安全组放行；2) iptables -L / nft list ruleset 看规则；3) 云上同时查安全组与网络 ACL；4) 改动前先放通再收紧，避免把自己关外面；5) 记录变更便于回滚。',
  },
  {
    id: 'kb-cron-fail',
    title: '定时任务未执行 / 静默失败',
    keywords: ['crontab 未执行', '定时任务失败', 'cron 不触发', '邮件告警', 'PATH 问题'],
    tags: ['cron', '调度', '运维'],
    a: '1) crontab -l 确认任务存在且时间正确；2) cron 环境 PATH 精简，命令用绝对路径；3) 输出重定向到日志（否则邮件可能丢弃）；4) 看 /var/log/cron；5) 复杂调度建议迁移到专业调度器并加失败告警。',
  },
  {
    id: 'kb-cert-renew',
    title: '证书自动续期失败',
    keywords: ['证书续期', 'renew', 'acme', 'letsencrypt', 'cert-manager', 'HTTP-01', 'DNS-01'],
    tags: ['cert', '证书', '自动化'],
    a: '1) 看续期任务日志（certbot renew --dry-run）；2) HTTP-01 需 80 端口可达，DNS-01 需 API 权限；3) 通配符必须 DNS-01；4) 证书链与权限（privkey 600）；5) 过期前自动续期并 reload 服务。',
  },
  {
    id: 'kb-perf-gc',
    title: '应用频繁 GC / 延迟毛刺',
    keywords: ['gc 频繁', 'full gc', '延迟毛刺', '停顿', 'jvm', '内存回收', 'node 内存'],
    tags: ['gc', '性能', '运行时'],
    a: '1) 看 GC 日志频率与停顿时长；2) JVM 调堆与 GC 器（G1/ZGC）；3) Node 看老生代与内存泄漏；4) 大对象/缓存未限容易触发；5) 毛刺伴随 CPU 尖峰多为 GC，需降分配速率。',
  },
  {
    id: 'kb-scaling',
    title: '容量评估与扩容决策',
    keywords: ['扩容', '容量评估', '水位', '阈值', '弹性伸缩', 'HPA', '规格'],
    tags: ['capacity', '扩容', '规划'],
    a: '1) 以 CPU/内存/连接数/磁盘水位定阈值（如 70% 预警）；2) 无状态服务优先水平扩容+负载均衡；3) 有状态（DB）垂直扩容或读写分离；4) K8s 用 HPA 按指标弹性；5) 扩容前先排除单点瓶颈与慢依赖。',
  },
  {
    id: 'kb-incident',
    title: '故障应急与止损流程',
    keywords: ['故障应急', '止损', 'incident', '复盘', '降级', '熔断', '值班'],
    tags: ['incident', '应急', '流程'],
    a: '1) 先止损（限流/降级/切流/回滚）再排查根因；2) 快速定位影响面与关键路径；3) 及时同步进展、拉群协作；4) 保留现场（日志/快照）便于复盘；5) 事后写复盘（时间线+根因+改进项）闭环。',
  },
  {
    id: 'kb-monitor-alert',
    title: '监控告警噪声治理',
    keywords: ['告警风暴', '告警噪声', '误报', '告警收敛', '抑制', '沉默', '分级'],
    tags: ['monitor', '告警', '治理'],
    a: '1) 告警分级（P0-P3）并与值班对齐；2) 去重/收敛/沉默避免风暴；3) 阈值结合基线而非拍脑袋；4) 只告警"需要人马上做"的事；5) 定期清理无效规则，降低疲劳。',
  },
]

/** 资产 ↔ 项目 ↔ 工单 ↔ 知识 的关联数据（示例，后续可来自 CMDB/工单系统）。 */
const PROJECTS = [
  { asset: 'web-01', project: '官网重构', ticket: 'OPS-1024', knowledge: '磁盘空间不足 磁盘满 清理', note: '承载官网静态资源，磁盘敏感' },
  { asset: 'db-01', project: '核心交易库', ticket: 'OPS-0871', knowledge: '内存不足 OOM 排查', note: '主库，内存敏感' },
  { asset: 'gw-01', project: '统一网关', ticket: 'OPS-1102', knowledge: '网络不通 丢包 延迟排查', note: '入口网关，网络敏感' },
  { asset: 'web-01', project: 'CDN 静态资源迁移', ticket: 'OPS-1156', knowledge: '服务启动失败 systemctl 排查', note: '迁移期间观察磁盘与进程数' },
  { asset: 'db-01', project: 'MySQL 5.7 → 8.0 升级', ticket: 'OPS-1201', knowledge: 'MySQL 慢查询 索引 排查', note: '升级前备份 + 慢 SQL 基线' },
  { asset: 'gw-01', project: 'HTTPS 证书统一续期', ticket: 'OPS-1188', knowledge: '证书过期 域名不匹配 排查', note: '证书链完整性需复核' },
  { asset: 'asset-localhost', project: '本机监控基线搭建', ticket: 'OPS-1300', knowledge: '监控告警噪声治理', note: '首次部署环境，重点看告警收敛' },
]

/**
 * 按关键词检索内置 FAQ（大小写不敏感），按相关度降序返回。
 * 匹配维度：完整 query 命中任一 keyword/title、任一 keyword 命中 query 分词、query 命中 keyword 分词。
 * 相关度 = 命中 keyword 数 ×2 + 标题命中 ×3 + 完整句命中 ×5，保证"越相关越靠前"。
 */
export function searchKnowledge(query) {
  const q = (query || '').toLowerCase().trim()
  if (!q) return []
  const words = q.split(/\s+/).filter(Boolean)
  const scored = FAQ.map((f) => {
    const hay = (f.title + ' ' + f.keywords.join(' ') + ' ' + f.tags.join(' ')).toLowerCase()
    let score = 0
    if (hay.includes(q)) score += 5
    if (f.title.toLowerCase().includes(q)) score += 3
    for (const w of words) {
      for (const k of f.keywords) {
        const kk = k.toLowerCase()
        if (kk.includes(w)) score += 2
        else if (w.includes(kk)) score += 1
      }
      if (f.title.toLowerCase().includes(w)) score += 2
    }
    return { f, score }
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
  return scored.map((x) => x.f)
}

/** 按稳定 id 取单条内置 FAQ（供详情接口命中）。 */
export function getBuiltinById(id) {
  return FAQ.find((f) => f.id === id) || null
}

/**
 * 知识条目 ↔ 关联资产（展示用：详情页可点击跳转资产）。
 * 按知识主题与系统内资产（web-01 / db-01 / gw-01 / 本机）做合理映射；
 * 实际接入 CMDB 后可替换为真实关联查询，签名不变。
 */
const KNOWLEDGE_ASSETS = {
  'kb-disk-full': ['web-01', 'asset-localhost'],
  'kb-cpu-high': ['web-01', 'asset-localhost'],
  'kb-mem-oom': ['db-01'],
  'kb-net-unreach': ['gw-01'],
  'kb-svc-fail': ['web-01'],
  'kb-mysql-slow': ['db-01'],
  'kb-mysql-replica': ['db-01'],
  'kb-pg-conn': ['db-01'],
  'kb-redis-mem': ['db-01'],
  'kb-k8s-pod-crash': ['asset-localhost'],
  'kb-k8s-node-notready': ['asset-localhost'],
  'kb-cert-expired': ['gw-01'],
  'kb-ssh-fail': ['web-01'],
  'kb-db-backup': ['db-01'],
  'kb-load-high': ['web-01'],
  'kb-swap-used': ['db-01'],
  'kb-port-conflict': ['web-01'],
  'kb-filehandle': ['web-01'],
  'kb-dns-fail': ['gw-01'],
  'kb-api-timeout': ['gw-01'],
  'kb-log-rota': ['web-01'],
  'kb-firewall': ['gw-01'],
  'kb-cron-fail': ['web-01'],
  'kb-incident': ['db-01'],
}

/** 按稳定 id 取关联资产名列表（无映射返回空数组）。 */
export function relatedAssetsFor(id) {
  return KNOWLEDGE_ASSETS[id] || []
}

/** 全部内置 FAQ（供知识库列表合并展示，标注 source=builtin-faq）。 */
export function listBuiltin() {
  return FAQ
}

export function relatedProjects(asset) {
  if (!asset) return PROJECTS
  const a = asset.toLowerCase()
  return PROJECTS.filter((p) => p.asset.toLowerCase().includes(a) || a.includes(p.asset.toLowerCase()))
}
