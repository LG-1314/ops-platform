# 架构文档 - 企业级运维监控管理平台 v2.0

> 生成日期：2026-08-17
> 作者：高见远（首席架构师）｜ 团队：MVP 开发专家团

## 1. 现有技术栈（已核验代码库，非臆测）

- 壳：Electron 28（主进程用自定义 `app://` 协议加载前端，首屏不走本地 HTTP）
- 前端：React 18 + TypeScript + Vite 5 + MUI 5 + Tailwind
- 后端：Express 4 本地能力总线（端口 8787），分层 routes/services/store
- 存储：进程内内存（memoryStore，重启丢失）→ 本次升级为 SQLite

## 2. 选型矩阵（锁定 + 版本锚定）

| 层 | 选择 | 版本 | 理由 |
|----|------|------|------|
| 图标库 | @mui/icons-material | ^5.16.7 | 与 MUI5 同源，唯一图标源 |
| SSH 采集 | ssh2（纯 JS） | ^1.17.0 | 流式 exec/SFTP/端口转发；弃 node-ssh（全量缓冲不适用日志流）、弃系统 ssh（Windows 无原生 OpenSSH） |
| MySQL | mysql2 | ^3.23.3 | 纯 JS |
| PostgreSQL | pg | ^8.16.3 | 纯 JS |
| Redis | ioredis | ^5.8.2 | 纯 JS |
| K8s | @kubernetes/client-node | ^1.4.0 | 官方纯 JS，读 kubeconfig，支持 watch；弃 kubectl CLI 封装（依赖本机 kubectl） |
| 云 API | 按产品分包 SDK + 通用 REST 兜底 | 按需 | 腾讯云 cvm/monitor/cbs、阿里云 @alicloud/*；禁全量 SDK（数十 MB） |
| 持久化 | better-sqlite3 | ^12.4.1 | 同步 API 简单可靠；弃 sql.js（3-5x 慢）、弃 JSON 文件（无事务查询） |

## 3. 关键约束 / 不可行警告（已实测验证）

1. **依赖位置**：所有新增运行时依赖必须放 `dependencies`（非 devDependencies），否则打包后运行时 MODULE_NOT_FOUND。当前 React/MUI/Electron/Vite 全在 devDependencies（Vite 打进 bundle），仅 express/cors 在 dependencies。
2. **better-sqlite3 原生模块（最大集成风险）**：本机 node v22 与 Electron 28 内嵌 Node 18.18 ABI 不匹配，必须 `@electron/rebuild` 按 Electron 28 ABI 重编译；`.node` 需 asar 解包（确认 asarUnpack 覆盖）。
3. **@kubernetes/client-node 1.x ESM-only**：后端是 ESM（src/server/package.json type:module）可兼容；依赖树含 ws/tar，按需 import 避免全量引入。
4. **凭据安全**：SSH 密码/私钥、DB 密码、kubeconfig、云 SecretKey 落库前用 Electron `safeStorage` 包裹加密，不落明文。
5. **electron-builder 打包**：`files` 仅写 `dist-electron/**/*`，但 `dependencies` 仍自动打进 app.asar/node_modules（已用 asar list 验证）。

## 4. 架构分层（在现有 routes/services/store 上扩展）

```
src/server/
  routes/       # HTTP 路由（assets/alerts/... 新增 metrics/ssh/db/k8s/cloud）
  services/     # 业务逻辑（新增 sshService/dbService/k8sService/cloudService/metricService/alertEngine）
  store/        # SQLite 持久化（替换 memoryStore）
src/main/       # Electron 主进程（新增 safeStorage 凭据加密、ssh 采集调度）
src/renderer/   # 前端（新增仪表盘/图表/告警/拓扑/终端页面）
```

## 5. 新增依赖清单

- **dependencies**：ssh2 ^1.17.0、mysql2 ^3.23.3、pg ^8.16.3、ioredis ^5.8.2、@kubernetes/client-node ^1.4.0、better-sqlite3 ^12.4.1、tencentcloud-sdk-nodejs-cvm/-monitor/-cbs（按需）、@alicloud/*（按需）
- **devDependencies**：@electron/rebuild、@types/ssh2、（@types/better-sqlite3 若版本未自带类型）

完整 ADR：`docs/decisions/ADR-001-tech-selection-upgrade.md`
