# API 参考（能力总线）

> 路由前缀统一为 `/api`。统一响应信封：`{ code: number, data: any, message: string }`，`code=0` 表示成功。
> HTTP 状态码透传业务结果（200/400/401/403/404/409/422/500…）。
> 鉴权：`GET` 只读接口本地开放；**变更型接口（POST/PUT/DELETE）与敏感读接口要求登录会话**，请求头携带 `x-ops-user-token`（前端登录后自动附加）。应用级写令牌 `x-ops-token` 由主进程注入，用于本地写操作防越权。

## 健康检查 / 运行指标

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 存活探针 |
| GET | `/metrics` | 进程 uptime / 内存 / 平台 / node 版本 |

## 认证与用户（RBAC）

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST | `/auth/login` | 公开 | 登录，返回 `{ token, user }` |
| POST | `/auth/logout` | 会话 | 登出 |
| GET | `/auth/me` | 会话 | 当前用户 |
| POST | `/auth/change-password` | 会话 | 改密（≥6 位） |
| GET | `/users` | 管理员 | 用户列表 |
| POST | `/users` | 管理员 | 新建用户 |
| PUT | `/users/:id` | 管理员 | 改用户（显示名/角色/密码） |
| DELETE | `/users/:id` | 管理员 | 删用户 |

## 资产 / 主机

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/assets` | 会话 | 列表（支持 `q` 关键字、`type` 过滤） |
| GET | `/assets/:id` | 会话 | 详情 |
| POST | `/assets` | 会话 | 新建 |
| PUT | `/assets/:id` | 会话 | 更新 |
| DELETE | `/assets/:id` | 会话 | 删除 |
| POST | `/assets/discover` | 会话 | 自动发现本机（仅补标签，不覆盖监控结果） |
| POST | `/assets/probe` | 会话 | 全量探测在线/延迟 |
| POST | `/assets/:id/probe` | 会话 | 单台探测 |

## 凭据 / 连接

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET/POST/PUT/DELETE | `/credentials(/:id)` | 会话 | 凭据 CRUD（明文加密落盘，列表脱敏） |
| POST | `/ssh/collect` | 会话 | 经 SSH 采集主机指标 |
| GET/POST/DELETE | `/db(/:id)` | 会话 | 数据库连接 CRUD |
| GET | `/db/:id/health` | 会话 | 数据库连接健康 |
| GET/POST/DELETE | `/cloud(/:id)` | 会话 | 云账号 CRUD |
| GET | `/cloud/:id/resources` | 会话 | 云资源列表 |

## 集群（K8s）

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/clusters` | 会话 | 集群列表 |
| POST | `/clusters` | 会话 | 新建集群 |
| GET | `/clusters/:id` | 会话 | 集群详情（节点/负载/智能体） |
| POST | `/clusters/:id/scan` | 会话 | 协同巡检 |
| PUT | `/clusters/:id` | 会话 | 更新集群 |
| DELETE | `/clusters/:id` | 会话 | 删除集群 |

## 监控 / 指标 / 告警 / 巡检

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/monitor/summary` | 会话 | 监控大盘汇总 |
| GET | `/monitor/health-history` | 会话 | DB/集群健康时序 |
| GET | `/metrics/history` | 会话 | 主机指标时序 |
| GET/POST | `/alerts` | 会话 | 告警列表/新建 |
| PATCH | `/alerts/:id` | 会话 | 状态流转（ack/resolve…） |
| DELETE | `/alerts/:id` | 会话 | 删告警 |
| GET/POST/PUT/DELETE | `/alert-rules(/:id)` | 会话 | 告警规则 CRUD |
| POST | `/alert-rules/evaluate` | 会话 | 手动评估 |
| GET/POST/PUT/DELETE | `/patrols(/:id)` | 会话 | 巡检任务 CRUD |
| POST | `/patrols/:id/run` | 会话 | 执行巡检 |

## 自动化 / 知识 / 关联 / 诊断

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET/POST/DELETE | `/automation/incidents(/:id)` | 会话 | 故障（Incident）CRUD |
| PATCH | `/automation/incidents/:id` | 会话 | 状态流转 |
| GET/POST/DELETE | `/automation/cicd(/:id)` | 会话 | CI/CD 流水线 CRUD |
| GET | `/knowledge/search?q=` | 公开 | 内置 FAQ 检索 |
| GET/POST/PUT/DELETE | `/knowledge(/:id)` | 会话(list)/公开(search) | 知识 CRUD；详情 GET 可命中内置 FAQ |
| GET | `/relations/:asset` | 公开 | 资产关联项目/工单/知识 |
| POST | `/diagnostics/run` | 会话 | 本机只读系统体检 |
| GET | `/diagnostics/history` | 会话 | 体检历史 |
| POST | `/guardrails/check` | 会话 | 运维防呆检查 |
| POST | `/dolores/run` | 会话 | OpenClaw 运维任务 |

## 通知渠道

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET/POST/PUT/DELETE | `/notification-channels(/:id)` | 会话 | 渠道 CRUD（密钥加密，列表脱敏） |
| POST | `/notification-channels/:id/test` | 会话 | 连通性测试 |

## 终端 WebSocket

- 路径：`ws://127.0.0.1:<port>/api/terminal`
- 鉴权：query `token` 需等于应用级写令牌（由 `ops-auth-token` 取回）。
- 参数：`host`、`port`、`credentialId`、`cols`、`rows`。
- 协议：客户端发 JSON `{type:'resize',rows,cols}` 或纯文本输入；服务端透传 shell 输出。
