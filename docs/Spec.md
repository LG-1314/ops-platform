# Spec - 企业级运维监控管理平台 v2.0

> 生成日期：2026-08-17
> 基于：PRD v2.0 + 架构文档 v2.0 + UIUX 文档 v2.0
> 状态：已确认（用户 2026-08-17 确认三文档通过）

---

## 1. 产品定义
- **一句话描述**：开箱即用的一体化桌面运维工作台，SSH 免 Agent 深度采集 + 统一告警 + 多系统连接（SSH/数据库/K8s/云）。
- **目标用户**：中小企业 IT 运维/SRE（1-5 人）、IT 服务商/MSP、DevOps、个人站长。
- **核心问题**：运维工具割裂（监控/面板/数据库/K8s/云分散在 4-5 工具），学习成本高、部署重。

## 2. MVP 范围（锁定）

| 优先级 | 功能 | 验收标准摘要 | RICE |
|--------|------|-------------|------|
| P0 | SSH 免 Agent 深度指标采集 | 添加主机(IP+SSH凭据)后，采集 CPU/内存/磁盘/网络/进程/日志 | 4.5 |
| P0 | 统一告警引擎 | 阈值规则 + 飞书/钉钉/企微/邮件 + 收敛降噪/静默/排班 | 5.4 |
| P0 | 数据库监控 | MySQL/Redis/PostgreSQL 指标 + 慢查询/连接数 | 3.5 |
| P0 | 精美仪表盘/可视化 | Grafana 风图表，深色操作台 | 4.5 |
| P0 | SQLite 持久化 | 重启不丢数据（替换内存存储） | - |
| P1 | 云平台 API 接入 | 腾讯云/阿里云资源纳管 | 1.9 |
| P1 | 日志采集分析 | SSH 拉取日志 + 检索 | 1.9 |
| P1 | K8s 集群监控 | 节点/Pod/负载/事件 | 1.1 |
| P1 | Web SSH 终端 | 浏览器内直连主机终端 | - |
| P2 | AI 根因诊断 | 结合现有诊断/知识库 | 0.8 |

## 3. 明确不做（Out-of-Scope）
| 不做的功能 | 原因 | 何时考虑 |
|------------|------|----------|
| Agent 采集（内网无 SSH 场景） | MVP 阶段 SSH 免 Agent 已覆盖主要场景 | P2 或用户反馈后 |
| Web 服务端（B/S 多租户） | 用户锁定桌面版 | 有团队协作需求后 |
| 多租户 SaaS | 桌面单用户形态 | 架构转型后 |
| 全量云 SDK | 体积过大（数十 MB） | 按需分包 |

## 4. 技术架构（锁定 + 版本锚定）
| 层 | 技术 | 版本 |
|----|------|------|
| 壳 | Electron | 28.x |
| 前端 | React + TypeScript + Vite | 18.3 / 5.4 |
| UI 库 | MUI 5 | ^5.16.7 |
| 图标 | @mui/icons-material | ^5.16.7（唯一图标源） |
| 后端 | Express | ^4.21 |
| SSH | ssh2（纯 JS） | ^1.17.0 |
| DB 连接 | mysql2 / pg / ioredis | ^3.23 / ^8.16 / ^5.8 |
| K8s | @kubernetes/client-node | ^1.4.0 |
| 持久化 | better-sqlite3 | ^12.4.1 |
| 凭据加密 | Electron safeStorage | 内置 |

## 5. API 端点清单（锁定，Phase 2 架构师产出 openapi.yaml）

现有保留：assets（list/get/create/update/remove/discover/probe/probeAll）、diagnostics、dashboard、knowledge、relations、patrols、alerts、reports、automation、clusters、guardrails、dolores。

新增：
| Method | Path | 功能 |
|--------|------|------|
| POST | /api/hosts | 添加主机（含 SSH 凭据） |
| PUT/DELETE | /api/hosts/:id | 更新/删除主机 |
| POST | /api/hosts/:id/test | 测试 SSH 连接 |
| POST | /api/hosts/:id/collect | 采集指标 |
| GET | /api/hosts/:id/metrics | 指标历史（range 查询） |
| GET | /api/hosts/:id/processes | 进程列表 |
| GET | /api/hosts/:id/logs | 日志拉取 |
| GET/POST | /api/alert-rules | 告警规则 |
| PUT/DELETE | /api/alert-rules/:id | 规则 CRUD |
| GET/POST | /api/notification-channels | 通知渠道 |
| POST | /api/alerts/:id/ack·resolve | 告警处理 |
| POST/GET | /api/db/connections | 数据库连接 |
| GET | /api/db/:connId/metrics·slowlog | 数据库指标/慢查询 |
| POST | /api/k8s/clusters | 集群接入 |
| GET | /api/k8s/clusters/:id/nodes·pods·workloads | 集群资源 |
| POST | /api/cloud/accounts | 云账号接入 |
| GET | /api/cloud/instances | 云资源列表 |
| WS | /api/terminal/:hostId | Web SSH 终端 |

## 6. 数据库表清单（SQLite，锁定）
| 表名 | 核心字段 |
|------|----------|
| assets | id, name, type, host, ip, port, source, tags, health_score, status, reachable, latency_ms, last_check_at, created_at |
| host_connections | id, asset_id, auth_type, username, port, credential_id |
| credentials | id, name, type, encrypted_secret(安全存储) |
| metrics | id, asset_id, metric_name, value, unit, collected_at |
| alert_rules | id, name, scope, metric, operator, threshold, level, enabled |
| notification_channels | id, type(飞书/钉钉/企微/邮件), config, enabled |
| alerts | id, level, title, asset_id, message, state, created_at, acked_by |
| db_connections | id, name, type, host, port, username, credential_id |
| k8s_clusters | id, name, endpoint, credential_id, connected |
| cloud_accounts | id, provider, credential_id |

## 7. 页面清单（锁定）
| 页面 | 路由 | 核心组件 |
|------|------|----------|
| 仪表盘 | / | 指标卡、趋势图、告警摘要、健康分布 |
| 资产纳管 | /assets | 主机列表、添加主机、可达/延迟 |
| 主机详情 | /assets/:id | 指标图表(CPU/内存/磁盘/网络)、进程、日志 |
| 告警 | /alerts | 告警列表、规则管理、通知渠道 |
| 数据库 | /databases | 连接管理、指标、慢查询 |
| K8s 集群 | /kubernetes | 集群、节点、Pod、负载 |
| 云资源 | /cloud | 云账号、实例列表 |
| 日志 | /logs | 日志检索 |
| 拓扑 | /topology | 资产关系拓扑 |
| 终端 | /terminal | Web SSH 终端 |
| 巡检/诊断/知识库/报告/设置 | 现有路由 | 保留增强 |

## 8. 设计 Token（锁定）
- 主色：#3D7BFF 电光蓝；深色背景 #0B0E14 / 面板 #141923
- 语义色：success #34D399 / warning #F59E0B / danger #F87171 / info #3D7BFF / in-progress #22D3EE
- 字体：Inter + Noto Sans SC；数字 JetBrains Mono（tabular-nums 右对齐）
- 图标：@mui/icons-material（outlined，16/20/24px）
- 主题：深色默认 + 浅色备选，跟随 nativeTheme

## 9. 验收标准（EARS）
| 编号 | 功能 | 验收标准 | 优先级 |
|------|------|----------|--------|
| AC-01 | 添加主机 | While 用户填写主机 IP + SSH 凭据并保存，系统必须测试连接并返回结果 | P0 |
| AC-02 | 指标采集 | When 主机已添加且 SSH 可达，系统必须采集 CPU/内存/磁盘/网络指标并入库 | P0 |
| AC-03 | 告警触发 | If 指标超阈值，系统必须触发告警并通过通知渠道发送 | P0 |
| AC-04 | 告警降噪 | When 同一告警重复触发，系统必须收敛为一条并计数 | P0 |
| AC-05 | 数据持久化 | When 应用重启，系统必须从 SQLite 恢复资产/规则/告警 | P0 |
| AC-06 | 凭据安全 | While 保存 SSH/DB 凭据，系统必须用 safeStorage 加密后落库 | P0 |
| AC-07 | 数据库监控 | When 添加数据库连接，系统必须展示指标与慢查询 | P0 |
| AC-08 | 仪表盘 | When 打开首页，系统必须展示深色操作台仪表盘（图表+指标卡） | P0 |

## 10. 边界与约束
- 支持 Windows x64；Electron 28 内嵌 Node 18.18
- 原生模块 better-sqlite3 需按 Electron ABI rebuild + asar 解包
- 所有新增运行时依赖放 dependencies
- 禁 emoji 图标、禁紫粉渐变、禁硬编码色值（#fff/#000 除外）

## 11. 内嵌已知坑
| 坑 | 技术指纹 | 根因 | 修法 |
|----|----------|------|------|
| better-sqlite3 ABI 不匹配 | electron-28 + native | Node 22 编译 vs Electron 18.18 | @electron/rebuild 重编译 + asarUnpack |
| 运行时 MODULE_NOT_FOUND | electron-builder | 依赖放错 devDependencies | 新增依赖一律放 dependencies |
| 凭据明文泄露 | 存储 | 密码/SecretKey 直存 | Electron safeStorage 加密 |

## 12. 端到端验证步骤
```bash
# 1. 安装依赖 + 原生模块 rebuild
npm install && npx electron-rebuild -f -w better-sqlite3
# 2. 类型检查
npm run typecheck
# 3. 构建
npm run build:electron
# 4. 打包
npm run pack:win
# 5. 启动验证
# 打开 exe → 首屏 app:// 正常 → 添加主机(填 IP+SSH) → 测试连接 → 采集指标
# → 仪表盘显示图表 → 配置告警规则 → 触发告警 → 重启应用数据仍在
```

## 13. 变更记录
| 日期 | 变更内容 | 原因 | 影响范围 |
|------|----------|------|----------|
| 2026-08-17 | 初版 Spec 生成 | 用户确认三文档 | 全量 |
