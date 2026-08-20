# NexusOps 对标扩展蓝图

> 目的：参考开源运维平台 NexusOps，对 `ops-platform` 做功能扩展、优化与丰富，并修复差距。
> 结论先行：NexusOps 有多个同名实体，**本平台应同时参考两个**——① `kasidit-wansudon/nexusops`（自托管运维/部署平台）作为「能力广度」对标；② `lobehub` 的 `nasif1731-nexusops`（自主 SRE 编排）作为「智能运维」对标。

---

## 1. NexusOps 实体甄别（避免对标错对象）

| 实体 | 性质 | 与本平台关系 |
|------|------|------------|
| NexusTek **NexusOps + NexusIQ** | 商业 AI IT 服务台（SaaS） | 仅供概念参考（AI 工单/知识） |
| **github.com/kasidit-wansudon/nexusops** | 自托管开发者平台：**CI/CD + 部署 + 监控 + 团队协作**；Go + Docker/K8s + Next.js + PostgreSQL/Redis/Prometheus/Grafana；含 RBAC、通知渠道、部署策略 | **直接对标**：能力矩阵最像我们的运维总线 |
| lobehub MCP **nasif1731-nexusops** | 自主 SRE 编排：LangGraph + CrewAI + K8s 治理/审计 | **智能运维对标**：告警自愈/根因/编排 |
| NEXUSOPS SARL | 车队管理 SaaS | 无关，排除 |

---

## 2. 能力差距矩阵（我们 vs kasidit-wansudon/nexusops）

| 能力 | NexusOps | 我们现状 | 差距 |
|------|----------|---------|------|
| 资产管理 | 基础 | ✅ 真实 CRUD + TCP/ICMP 探测 | 持平 |
| SSH/DB/云/K8s 真连 | 部分 | ✅ ssh2/mysql2/pg/ioredis/腾讯云/阿里云/k8s | **我们更全** |
| 告警 + 通知渠道 | ✅ 飞书/钉钉/Slack/Webhook/邮件 | 🟡 **本轮已落地** Webhook/飞书/钉钉/应用内 | 仅缺邮件 |
| 监控栈 | ✅ Prometheus/Grafana 对接 | ⚠️ 仅进程内指标，无时序库 | 差距大 |
| CI/CD | ✅ 完整流水线 | ⚠️ `automation` 硬编码示例，无真实接入 | 差距大 |
| 部署策略 | ✅ 蓝绿/金丝雀 | ❌ 无 | 全新 |
| RBAC / 多用户 | ✅ | ❌ 单机单用户 | 全新 |
| 团队协作/工单 | ✅ | ⚠️ 知识/关联/事故（占位为主） | 中 |
| 智能 SRE 编排 | （lobehub 版）✅ | ❌ | 全新 |

**判断**：我们的「连接层」比 NexusOps 更厚（真实多云/多协议），短板在「上层能力」——监控栈、CI/CD 真实化、RBAC、智能编排、通知（本轮已补）。

---

## 3. 扩展路线图（按 ROI 排序）

### P0 — 立刻做（护城河，对标 NexusOps 通知/连接）
- [x] **通知渠道**（本轮已完成：Webhook/飞书/钉钉/应用内）。
- [ ] **通知渠道补邮件**：用 `nodemailer`（加为依赖）或复用企业邮件 SMTP；与现有 `notificationChannels` 模型统一。
- [ ] **诊断/体检边界收口**：本轮已澄清文案；下一步把「本机体检」与「远程 SSH 采集」在导航/数据上物理分离，避免 PRD 误导。

### P1 — 本季度（对标监控栈 / CI-CD / 团队协作）
- [ ] **监控栈对接**：把内存 `hostMetricsCache` 接入 **Prometheus 远程写 / 或 SQLite 时序表**，让 `Hosts.tsx` 出趋势曲线（对标 Grafana）。最小可行：内置轻量时序（按资产+时间存样本），不强制外置 Prometheus。
- [ ] **CI/CD 真实化**：`automation` 模块从硬编码示例改为接 Git 平台（GitHub/GitLab Webhook + 状态回写），流水线列表真实拉取；对齐 NexusOps 的 pipeline 视图。
- [ ] **知识库自维护持久化**：当前内置 6 条 FAQ 不落盘；改为可增删改并持久化（复用 `memoryStore` + `persist.ts`）。
- [ ] **报告 PDF 真实生成**：用 `pdfkit` 或把 Markdown 经 headless 渲染为 PDF，替换当前 Markdown 占位。

### P2 — 进阶（对标 RBAC / 部署 / 智能 SRE）
- [ ] **RBAC / 多用户**：NexusOps 的 RBAC 是团队协作核心。单机桌面形态下可做「操作审计 + 角色开关」（如只读模式），为将来服务端化预留 `user/role` 模型。
- [ ] **部署策略（蓝绿/金丝雀）**：在 `clusters`/K8s 能力上叠加部署编排（对标 NexusOps deploy strategies）。
- [ ] **智能 SRE 编排（对标 lobehub 版）**：告警命中 → 触发剧本（playbook）→ 自动收集证据（SSH 指标/日志）→ 生成根因摘要 → 建议/执行修复。先做「半自动」：告警详情页一键拉取关联指标+知识，人工确认后执行。

---

## 4. 实施建议
1. **保持「厚连接层」优势**：继续强化 ssh2/云/K8s 真连，这是 NexusOps 没我们全的地方。
2. **通知渠道已打通管道**，后续所有「事件」（巡检异常、Guardrails 风险、报告完成）都复用 `notificationService.notify`，低成本统一触达。
3. **监控栈优先做内置时序**（而非强依赖外置 Prometheus），降低部署门槛，符合单机桌面定位；需要 Grafana 式大盘的用户再接 Prometheus 远程写。
4. **智能 SRE 分阶段**：先「证据聚合 + 知识关联」人工闭环，再上「自动执行」，避免误操作的爆炸半径。

---

## 5. 本轮已落地（见《修复实施记录》）
- 通知渠道端到端（类型/存储/服务/路由/UI/告警联动）。
- 9 类安全/功能/一致性修复（命令注入、令牌鉴权、SSH CPU、诊断边界、凭据 PUT、顶栏告警数、状态色、死代码、集群种子）。
