# 运维全维度管理平台 · Ops Cockpit

把分散的运维能力（资产纳管、全栈诊断、智能巡检、知识检索、自动化治理、DevOps 编排、容器集群、运维防呆）收敛到一个统一工作台。所有诊断 **只读、不修改系统**，结果结构化、可追溯、可导出。

> 形态：Electron 桌面壳 + Vite 本地网页预览；后端 Node/Express 作为「能力总线」暴露 REST API。
> 版本：v0.1.0 · 55 项测试全部通过

## 快速启动

```bash
# 1. 安装依赖
npm install

# 2. 开发模式（浏览器预览 + Express 能力总线）
# 终端 1：启动能力总线
npx tsx src/server/index.ts
# 终端 2：启动 Vite 前端预览
npm run dev
# 打开 http://127.0.0.1:5173

# 3. 生产构建（测试 + 构建 + NSIS 安装包）
# 推荐：双击 scripts/pack.bat，或：
npm run pack:win
# 产物在 release/ ：安装包 *.exe 与免安装目录 win-unpacked/
```

## 架构

```
Electron 渲染进程 (React 18 + TS + MUI 5)
   │  REST：前端经 preload 暴露的 window.opsApi.request
   │        → IPC → 主进程 Node http → http://127.0.0.1:<port>/api（Express 能力总线）
   │        注：开发模式（pure browser）直接 fetch /api（Vite dev server 代理）
   ▼
Express 能力总线 (src/server, 默认端口 8787)
   │
   ▼
诊断引擎 / 巡检 / 知识库 / 关联 / 资产 / 告警 / 集群 / 防呆 / SSH / 数据库 / 云 / 终端
   │
   ▼
主机系统 (CPU / 内存 / 磁盘 / 进程 / 运行时长)
```

- **后端分层**：`src/server`（API 与编排）、`src/diagnostics`（跨平台只读诊断）、`src/shared`（类型与常量）。
- **统一 API 信封**：`{ code, data, message }`，`code=0` 表示成功。
- **状态四态**：正常 / 警告 / 严重 / 未知（MUI 图标，不用 emoji）。
- **存储**：进程内内存 + JSON 文件持久化（`store.json` + `metrics.json` + `health.json` + `audit.json`），重启不丢数据。
- **凭据加密**：AES-256-GCM，密钥存于 `ops-key.json`（用户数据目录）。
- **RBAC 多用户**：scrypt 密码哈希，login rate limiting，登录会话 24h 滑动续期，默认 admin/admin123。

## 目录

| 路径 | 说明 |
|------|------|
| `src/main/` | Electron 主进程 |
| `src/preload/` | 预加载桥（暴露 `opsApi`） |
| `src/renderer/` | React 前端（pages / components / theme） |
| `src/server/` | Express 能力总线、路由、服务层 |
| `src/diagnostics/` | 跨平台诊断引擎、知识库、解析器 |
| `src/shared/` | 类型 DTO、常量 |
| `docs/` | API 参考、UI 规范、知识库指南 |
| `build/` | NSIS 钩子与内置 VC++ 运行库 |

## 功能模块

| 模块 | 路由 | 实现程度 |
|------|------|----------|
| 仪表盘 | `/dashboard` | 态势总览、KPI 卡片、趋势图、告警/资产表 |
| 多服务器可视化监控 | `/monitor` | 主机实时健康网格、在线/离线/指标、DB/集群健康时序 |
| 主机监控 | `/hosts` | SSH 免 Agent 采集、实时指标、趋势、批量采集 |
| 告警中心 | `/alerts` | 告警列表 + 规则引擎 + 通知渠道 |
| 资产纳管 | `/assets` | TCP/ICMP 探测、CRUD、自动发现 |
| 系统体检 | `/diagnostics` | 本机 CPU/内存/磁盘/负载一键诊断 |
| 知识检索 | `/knowledge` | 30 条内置 FAQ + 自维护 + 关联资产 + 标签筛选 |
| 关联视图 | `/relations` | 资产↔项目↔工单↔知识关联 |
| 智能巡检 | `/patrols` | 巡检任务编排与执行 |
| 流程自动化 | `/automation` | 事故管理 + CI/CD 台账 |
| SSH 终端 | `/terminal` | WebSocket 桥接至目标主机 shell |
| 数据库监控 | `/databases` | MySQL/PostgreSQL/Redis 健康检查 |
| K8s 集群 | `/clusters` | 节点/工作负载详情 |
| 云资源 | `/cloud` | 腾讯云/阿里云实例纳管 |
| 运维工具箱 | `/ops-tools` | Guardrails 防呆检查 + Dolores 工具 |
| 用户管理 | `/users` | RBAC 多用户 CRUD |
| 设置 | `/settings` | 通知渠道配置、主题切换、能力总线状态 |

## 主要改进（v0.1.0）

- 安全：密码 scrypt 哈希 + 登录 rate limiting + 会话 TTL 滑动续期 + 首次登录强制改密
- 安全：应用令牌 + 用户令牌双层终端 WS 鉴权 + 操作审计日志
- 知识库：30 条内置 FAQ + 相关度排序 + 富文本步骤渲染 + 搜索关键词高亮 + 标签筛选 + 关联资产点击跳转
- 关联视图：7 条资产关联数据 + 知识可直接跳转检索
- 多服务器可视化：监控大盘健康环 + 实时指标 + 快速操作（终端/趋势/采集）
- 主机监控：表格内嵌实时指标条 + 采集全部 + 从大盘一键跳转趋势
- 主题：深色/浅色切换 + localStorage 持久化
- 非功能：Vite chunk 分割、操作日志、分页组件、ESLint + Prettier、55 项单元测试

## 日志与数据位置

桌面端数据目录为 `%APPDATA%\ops-platform\`（Electron `userData`）：

- 启动日志：`ops-platform-boot.log`
- 崩溃日志：`ops-platform-crash.log`
- 能力总线运行日志：`logs\ops-YYYY-MM-DD.log`
- 数据持久化：`store.json`、`metrics.json`、`health.json`、`audit.json`

## 环境变量

参见 `.env.example`：

- `PORT`：能力总线端口（默认 `8787`）
- `NODE_ENV`：`development` | `production`
