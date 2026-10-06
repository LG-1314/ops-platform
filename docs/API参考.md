# API 参考（能力总线）

> 路由前缀统一为 `/api`。统一响应信封：`{ code: number, data: any, message: string }`，`code=0` 表示成功。
> HTTP 状态码透传业务结果（200/400/401/403/404/409/422/500…）。
>
> 鉴权模型（双层令牌 + RBAC）：
> - **应用令牌** `x-ops-token`：主进程注入，拦截同机其它进程的越权写操作。变更型请求（POST/PUT/PATCH/DELETE）强制要求（`/auth/login` 除外）；终端 WebSocket 以 query 参数 `token` 传递。HTTP 请求**不再接受** query 传令牌（防 URL 泄露）。
> - **用户会话令牌** `x-ops-user-token`：登录后签发，24h 滑动续期 + 7 天绝对上限。绝大多数接口要求会话；`admin` 专属接口另需管理员角色。
> - **首次登录强制改密**：`mustChangePassword` 用户在改密前访问除 `/auth/*` 外的所有接口返回 403。
> - 标注「管理员」的接口：`requireUser + requireAdmin` 双重校验。

## 健康检查 / 运行指标

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/health` | 公开 | 存活探针 |
| GET | `/metrics` | 会话 | 进程 uptime / 内存 / 平台 / node 版本 |

## 认证与用户（RBAC）

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST | `/auth/login` | 公开 | 登录（失败限流：10 分钟窗口 5 次失败锁 10 分钟） |
| POST | `/auth/logout` | 会话 | 登出 |
| GET | `/auth/me` | 会话 | 当前用户 |
| POST | `/auth/change-password` | 会话 | 改密（≥8 位） |
| GET | `/users` | 管理员 | 用户列表 |
| POST | `/users` | 管理员 | 新建用户（`role` 缺省为 `personal`，最小权限） |
| PUT | `/users/:id` | 管理员 | 改用户（显示名/角色/密码；管理员重置的密码标记 mustChangePassword） |
| DELETE | `/users/:id` | 管理员 | 删用户（最后一个管理员不可删） |

## 资产 / 主机

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET/POST | `/assets` | 会话 | 列表（`q`、`type` 过滤）/ 新建 |
| GET/PUT/DELETE | `/assets/:id` | 会话 | 详情 / 更新 / 删除（删除时同步清理其指标时序） |
| POST | `/assets/discover` | 会话 | 自动发现本机（仅补标签） |
| POST | `/assets/probe` | 会话 | 全量探测在线/延迟 |
| POST | `/assets/:id/probe` | 会话 | 单台探测 |

## 凭据 / 连接

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET/POST/PUT/DELETE | `/credentials(/:id)` | 管理员 | 凭据 CRUD（明文加密落盘，列表脱敏；kind 枚举校验、字段长度上限；加密失败时保存被拒而不是存空密文） |

> 凭据与用户的增删改均写入审计日志（`credential.*` / `user.*`）。

## SSH / 数据库 / 云

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST | `/ssh/collect` | 管理员 | 经 SSH 采集主机指标（错误按类别脱敏返回） |
| POST | `/ssh/services` | 管理员 | systemd 服务列表 |
| GET/POST/PUT/DELETE | `/db(/:id)` | 会话 | 数据库连接 CRUD |
| GET | `/db/:id/health` | 会话 | 数据库连接健康（mysql/pg 带语句级超时 + 连接看门狗，redis commandTimeout） |
| GET/POST/PUT/DELETE | `/cloud(/:id)` | 会话 | 云账号 CRUD |
| GET | `/cloud/:id/resources` | 会话 | 云资源列表（腾讯/阿里全量分页拉取） |

## 集群（K8s）

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET/POST | `/clusters` | 管理员 | 列表 / 新建（endpoint 经 parseEndpoint 校验） |
| GET | `/clusters/:id` | 管理员 | 详情（节点/负载/智能体），回写连通性 |
| POST | `/clusters/:id/scan`、`/:id/diagnose` | 管理员 | 协同巡检 / 连接自检 |
| PUT/DELETE | `/clusters/:id` | 管理员 | 更新（含 `insecureSkipTlsVerify` 开关，默认开证书校验）/ 删除 |

## 监控 / 指标 / 告警 / 巡检

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/monitor/summary` | 会话 | 监控大盘汇总 |
| GET | `/monitor/health-history` | 会话 | DB/集群健康时序 |
| GET | `/metrics/history` | 会话 | 主机指标时序（>200 点降采样；7 天留存，环形 1440 点） |
| GET/POST/PATCH/DELETE | `/alerts(/:id)` | 会话 | 告警列表/新建/状态流转/删除（环形上限 1000 条） |
| GET/POST/PUT/DELETE | `/alert-rules(/:id)` | 会话 | 告警规则 CRUD（冷却期 + 同题去重；冷却表自动清理失效条目） |
| POST | `/alert-rules/evaluate` | 会话 | 手动评估 |
| GET/POST/PUT/DELETE | `/patrols(/:id)` | 管理员 | 巡检任务 CRUD |
| POST | `/patrols/:id/run` | 管理员 | 执行巡检（历史保留最近 50 次） |

## 自动化 / 知识 / 关联 / 诊断 / 防呆

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET/POST/PATCH/DELETE | `/automation/incidents(/:id)` | 管理员 | 故障（Incident）CRUD 与状态流转 |
| GET/POST/PUT/DELETE | `/automation/cicd(/:id)` | 管理员 | CI/CD 流水线台账（暂未接入真实 CI/CD 引擎） |
| GET/POST/PUT/DELETE | `/knowledge(/:id)` | 管理员 | 知识 CRUD |
| GET | `/knowledge/search?q=` | 管理员 | 内置 FAQ + 自维护知识检索 |
| GET | `/relations(/:asset)` | 管理员 | 资产关联项目/工单/知识（当前为内置演示数据） |
| POST | `/diagnostics/run` | 管理员 | 本机只读系统体检 |
| GET | `/diagnostics/history` | 管理员 | 体检历史 |
| POST | `/guardrails/check` | 会话 | 运维防呆检查 |
| POST | `/dolores/run` | 管理员 | Dolores 运维工具（目录清理带临时文件 mtime 保护） |

## AI 助手 / 智能体

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/ai/agents`、`/ai/providers`、`/ai/config` | 会话 | 智能体列表 / 供应商预设 / 当前配置（脱敏） |
| POST/PUT/DELETE | `/ai/agents(/:id)` | 管理员 | 智能体 CRUD（含内置 6 个专家） |
| PUT | `/ai/config` | 管理员 | 保存配置（baseUrl 仅允许 https 或本机回环 http，防 SSRF） |
| POST | `/ai/config/test` | 管理员 | 连通性测试 |
| POST | `/ai/chat`、`/ai/agent-chat`、`/ai/qa`、`/ai/report`、`/ai/analyze-host` | 会话 | 对话 / 问答 / 报告 / 主机分析 |

## 审计 / 防火墙 / 服务巡检 / 通知渠道

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/audit` | 管理员 | 操作审计（登录/改密/终端/用户/凭据等，环形 500 条） |
| GET/POST/PUT/DELETE | `/firewall(/:id)` | 管理员 | iptables 规则查询/增删（命令全量 shell 安全包裹） |
| GET/POST/PUT/DELETE | `/service-checks(/:id)` | 管理员 | 服务巡检项 CRUD 与执行 |
| GET/POST/PUT/DELETE | `/notification-channels(/:id)` | 会话 | 渠道 CRUD（密钥加密，列表脱敏） |
| POST | `/notification-channels/:id/test` | 会话 | 连通性测试（出站请求 8s 超时） |

## 终端 WebSocket

- 路径：`ws://127.0.0.1:<port>/api/terminal`
- 鉴权（verifyClient 四重）：query `token` = 应用令牌（常数时间比较）+ query `ut` = 有效用户会话 + `admin` 角色 + 非强制改密状态。
- 参数：`host`、`port`、`credentialId`、`cols`、`rows`（1-500 钳制）。
- 协议：客户端发 JSON `{type:'resize',rows,cols}` 或 `{data:'…'}` / 纯文本输入；服务端透传 shell 输出（二进制帧）。`maxPayload` 64KB；慢客户端 4MB 背压暂停/恢复；连接建立前后断开均保证释放 SSH 会话。
