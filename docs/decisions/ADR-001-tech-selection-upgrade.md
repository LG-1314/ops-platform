# ADR-001: 采集/连接/持久化技术选型（Electron 运维平台升级）

## Status: Accepted (2026-08)

## Background

现有代码库为 Electron 28 桌面应用（React 18 + TS + Vite 5 + Express 4 能力总线，端口 8787），主进程经自定义 `ops://` 协议加载前端，后端已分层 routes/services/store，但存储为进程内 memoryStore（重启丢失）。本次升级锁定：SSH 深度指标采集、数据库/K8s/云 API 连接、数据持久化。核心约束：主进程 `vite.config.ts` 用 `externalizeDeps` 把裸模块 external，运行时从 node_modules 解析；`electron-builder` 仅把 `dependencies` 打进 app.asar/node_modules。

已本地核验（非臆测）：
- `asar list release/win-unpacked/resources/app.asar` 确认 express/cors 及其传递依赖均在 asar 内，尽管 `build.files` 仅写了 `dist-electron/**/*`。
- 当前 `package.json` 中仅 `cors`、`express` 在 `dependencies`，其余（React/MUI/Electron/Vite）全在 `devDependencies`（由 Vite 打进 bundle）。
- `src/server/package.json` 为 `{"type":"module"}`，后端是 ESM。
- 本机 `node -v` = v22.22.2，与 Electron 28 内嵌 Node 18.18.2 的 ABI 不一致。

## Decision

| 能力 | 方案 A | 方案 B | 方案 C | 选定 |
|---|---|---|---|---|
| SSH 采集 | **ssh2 ^1.17.0（纯 JS）** | node-ssh ^13.2.1（ssh2 的 Promise 封装） | 系统 ssh 命令（child_process） | ssh2 |
| DB 连接 | **mysql2 ^3.23.3 / pg ^8.16.3 / ioredis ^5.8.2（均纯 JS）** | 原生驱动（mysql2 native、pg-native） | — | mysql2+pg+ioredis |
| K8s 连接 | **@kubernetes/client-node ^1.4.0（官方纯 JS）** | 封装 kubectl CLI（依赖本机 kubectl） | — | @kubernetes/client-node |
| 云 API | 全量 SDK（tencentcloud-sdk-nodejs） | **按产品分包 SDK（-cvm/-monitor/-cbs；@alicloud/\*）** | 通用 REST 手写签名 | 分包 SDK + REST 兜底 |
| 持久化 | **better-sqlite3 ^12.4.1（native）** | sql.js（WASM，免 rebuild，3-5x 慢） | JSON 文件 | better-sqlite3 |

理由：
- **ssh2 直用**：深度指标采集需要流式 exec（日志 tail、进程实时）与一次性命令（uptime/free/df），ssh2 的 stream API 最可控；SFTP 与端口转发（DB 经 SSH 隧道）是运维平台刚需。node-ssh 的 execCommand 全量缓冲不适合日志流。系统 ssh 命令在 Windows 无原生 OpenSSH、解析脆弱，弃。
- **mysql2/pg/ioredis 三者纯 JS**：无 rebuild，直接 externalize 进 dependencies 即可。
- **@kubernetes/client-node**：官方维护、读 kubeconfig、支持 watch；kubectl CLI 方案要求用户本机装 kubectl，Windows 场景普遍缺失，弃。
- **better-sqlite3**：同步 API 与现有 memoryStore 同步访问器风格一致，WAL 模式，业界 Electron 桌面持久化事实标准；指标时间序列远超 JSON 文件的承受力。
- **图标库（P0 锁定）**：`@mui/icons-material ^5.16.7`（已安装，Material SVG，与 MUI 5 同源），全项目唯一图标源，禁止 emoji 图标、禁止引入第二套图标库。

## Consequences

正面：
- 采集/连接层全部纯 JS 或官方客户端，MVP 无需自研协议实现。
- 持久化从内存态升级为 SQLite，数据可跨重启保留，支持后续时间序列指标查询。

负面 / 风险（必须写进实现规格）：
1. **所有新增运行时依赖必须放 `dependencies`**，否则打包后运行时 MODULE_NOT_FOUND。
2. **better-sqlite3 为原生模块**：需 `@electron/rebuild` 按 Electron 28 ABI 重编译（本机 Node 22 与 Electron 28 的 Node 18 ABI 不匹配）；`.node` 需 asar 解包（electron-builder `smartUnpack` 默认开启，需在 build 配置确认 `asarUnpack` 覆盖）。
3. **@kubernetes/client-node 1.x ESM-only**：项目后端为 ESM 可兼容；但其依赖树含 ws/tar，体积偏大，按需 import（KubeConfig/CoreV1Api 等）避免全量引入。
4. **云 SDK 全量包体积大**：必须按产品分包，禁止 `tencentcloud-sdk-nodejs` 全量包。
5. **凭据敏感**：SSH 密码/私钥、DB 密码、kubeconfig、云 SecretKey 落库前需加密——MVP 用 Electron `safeStorage` 包裹字段后再入 SQLite，不落明文。

## Related ADRs

- （待 PM/架构：数据模型与迁移方案 ADR）
