# 企业级运维服务器 · 全维度管理平台

把分散的运维能力（资产纳管、全栈诊断、智能巡检、知识检索、自动化治理、DevOps 编排、容器集群、运维防呆）收敛到一个统一工作台。所有诊断 **只读、不修改系统**，结果结构化、可追溯、可导出。

> 形态：Electron 桌面壳（Windows 安装包 + 绿色免安装版）+ Vite 本地网页预览；后端 Node/Express 作为「能力总线」暴露 REST API。

## 架构

```
Electron 渲染进程 (React 18 + TS + MUI + Tailwind)
   │  首屏：自定义协议 app://，主进程从 resources/app-dist 直接读文件
   │        （绕过本地 HTTP，避免代理/防火墙拦截 127.0.0.1）
   │  REST：preload 注入 window.opsApi.apiBase → http://127.0.0.1:<port>/api
   ▼
Express 能力总线 (src/server, 默认端口 8787)
   │
   ▼
诊断引擎 / 巡检 / 知识库 / 关联 / 资产 / 告警 / 集群 / 防呆
   │
   ▼
主机系统 (CPU / 内存 / 磁盘 / 进程 / 运行时长)
```

- **后端分层**：`src/server`（API 与编排）、`src/diagnostics`（跨平台只读诊断）、`src/shared`（类型与常量）。
- **统一 API 信封**：`{ code, data, message }`，`code=0` 表示成功。
- **状态四态**：正常 / 警告 / 严重 / 未知（MUI 图标，不用 emoji）。

## 目录

| 路径 | 说明 |
|------|------|
| `src/main/` | Electron 主进程 |
| `src/preload/` | 预加载桥（暴露 `opsApi`） |
| `src/renderer/` | React 前端（pages / components / theme） |
| `src/server/` | Express 能力总线、路由、服务层 |
| `src/diagnostics/` | 跨平台诊断引擎、知识库、解析器 |
| `src/shared/` | 类型 DTO、常量 |
| `docs/` | PRD、系统设计、类图、时序图 |
| `build/` | NSIS 钩子与内置 VC++ 运行库 |
| `release/` | 安装包与绿色版产物 |

## 启动

```bash
# 1. 安装依赖（国内网络慢可先设 Electron 镜像）
npm install
# ELECTRON_MIRROR="https://registry.npmmirror.com/-/binary/electron/" npm install

# 2. 开发预览：Vite(5173)，前端经代理访问 /api/*
npm run dev
# 打开 http://127.0.0.1:5173
# 能力总线需另行拉起，例如：
npx tsx src/server/index.ts

# 3. 前端 + Electron 主进程/preload 生产构建（输出 dist/ 与 dist-electron/）
npm run build

# 4. 打包 Windows 安装程序
# 受限网络建议同时设置 electron-builder 二进制镜像：
ELECTRON_MIRROR="https://registry.npmmirror.com/-/binary/electron/" \
ELECTRON_BUILDER_BINARIES_MIRROR="https://registry.npmmirror.com/-/binary/electron-builder-binaries/" \
CSC_IDENTITY_AUTO_DISCOVERY=false \
npm run pack:win
```

产物：

- **安装包**：`release/运维全维度管理平台-0.1.0-setup.exe`（NSIS，可更改安装目录，安装时静默部署 VC++）
- **绿色版**：`release/win-unpacked/`（整目录拷贝使用，勿只拷单个 exe）

> `pack:win` = `build` + `electron-builder --win --x64`。运行时依赖打进 asar；前端已由 Vite 打进 `dist/`，经 `extraResources` 落到 `resources/app-dist`。

### 打包注意（Windows）

若二次打包卡在 `winCodeSign` 解压并提示无法创建符号链接：把缓存目录里的 `winCodeSign` 手工解压一次，并补齐 darwin 下的 `libcrypto.dylib` / `libssl.dylib` 软链文件后重试，即可复用缓存跳过解压。

## 交付物与排查

- **绿色版必须整目录保留**：`release/win-unpacked/` 下 exe 必须与同目录 `resources/`（`app.asar`、`app-dist`、`vc_redist.x64.exe`）一起使用。
- **缺 VC++**：安装版会由 `build/installer.nsh` 静默安装；绿色版可管理员运行同目录 `resources/vc_redist.x64.exe`。
- **日志位置**
  - 崩溃：`%APPDATA%\ops-platform-crash.log`
  - 启动标记：`%APPDATA%\ops-platform-boot.log`
- **单实例锁**：已有实例运行时再次双击会提示，不会重复开窗。

## 已知限制

- 资产 / 告警 / 集群等列表目前为样例数据 + 本机真实指标混合；接入真实 CMDB / 监控源需扩展 `src/server` 服务层。
- 部分写接口（如集群创建、自动化工单）已在 API 暴露，前端表单与 DELETE 路由仍可按需补齐。
- 前端已统一 `loading / empty / error` 三态与 `ErrorBoundary`；剩余健壮性按需迭代。

## 环境变量

见 `.env.example`：

- `PORT`：能力总线端口（默认 `8787`）
- `NODE_ENV`：`development` | `production`
