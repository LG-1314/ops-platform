# 文档索引（docs/）

> 本目录为「运维全维度管理平台」的项目文档。本文档为索引，帮助快速定位活跃规范与历史记录。

## 活跃规范（以代码为准）

| 文档 | 说明 |
|------|------|
| [Spec.md](./Spec.md) | 产品规格契约（功能/API/页面/Token 锁定）。**注意：实际 API 面以 `src/server/index.ts` 路由注册为准**，Spec 的部分路由清单已滞后，待刷新。 |
| [PRD.md](./PRD.md) | 产品需求文档 |
| [UIUX.md](./UIUX.md) | 交互与视觉规范 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 架构总览（Electron 壳 + Express 能力总线 + React 前端） |

## 增量与实施记录

| 文档 | 说明 |
|------|------|
| [PLAN.md](./PLAN.md) | 实施计划 |
| [system_design.md](./system_design.md) | 系统设计详述 |
| [PRD-增量1-监控时序化与邮件通知.md](./PRD-增量1-监控时序化与邮件通知.md) | 增量1 需求 |
| [架构设计-增量1-监控时序化与邮件通知.md](./架构设计-增量1-监控时序化与邮件通知.md) | 增量1 架构 |
| [增量1实施记录.md](./增量1实施记录.md) | 增量1 落地记录 |
| [修复实施记录.md](./修复实施记录.md) | 历史修复记录 |
| [全维度检查与理解报告.md](./全维度检查与理解报告.md) | 早期理解报告（历史） |
| [NexusOps扩展蓝图.md](./NexusOps扩展蓝图.md) | 扩展方向设想 |

## 图表

| 文件 | 说明 |
|------|------|
| [class-diagram.mermaid](./class-diagram.mermaid) | 类图（仅覆盖部分核心模块，待扩充） |
| [sequence-diagram.mermaid](./sequence-diagram.mermaid) | 时序图（缺鉴权/资产添加/终端主流程） |

## 决策记录

| 文件 | 说明 |
|------|------|
| [decisions/ADR-001-tech-selection-upgrade.md](./decisions/ADR-001-tech-selection-upgrade.md) | 技术选型升级决策。**已撤销**：SQLite 升级未实施，当前存储为 JSON 文件持久化（`src/server/store/persist.ts`），详见下方「已知偏差」。 |

## 已知偏差（文档 vs 代码）

1. **持久化**：ADR-001 与旧 Spec 提及 SQLite，但当前实现为 `memoryStore` + JSON 原子写（`persist.ts`），零原生依赖以保证打包后百分百可运行。SQLite 非当前事实标准。
2. **API 面**：Spec §5 列出的部分路由已变化，新增 `/auth` `/users` `/monitor` `/metrics` `/ssh` `/db` `/cloud` `/credentials` `/notification-channels` `/alert-rules` 等；应以代码生成为准刷新。
3. **依赖版本**：以 `package.json` 为准，文档版本号已滞后。
4. **缺少脚本**：README/Spec 引用的 `npm run typecheck`、`npm run build:electron` 不存在，实际为 `dev`/`build`/`build:win`/`pack:win`。

## 待补文档（优先级）

- **API 参考**（openapi.yaml 或 API.md）—— 开发者最缺，解决 Spec 与代码脱节。
- **部署与运维 runbook**（环境变量、凭据加密机制、故障排查）—— 生产可用性关键。
- **知识库使用与维护指南**—— 见 [知识库指南](./知识库使用与维护指南.md)。

## 知识库

- [知识库使用与维护指南](./知识库使用与维护指南.md)：内置 FAQ 检索、点击查看、自维护条目、扩充方法。
