import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import { fileURLToPath, URL } from 'node:url'

// 桌面应用构建：Vite 负责渲染进程，vite-plugin-electron 负责主进程/preload 编译。
// 仅在 BUILD_ELECTRON=true 时启用 electron 插件；开发预览（npm run dev）只起 Vite + Express，不启动 GUI。
const enableElectron = process.env.BUILD_ELECTRON === 'true'

// 路径别名：src/shared 与 src/diagnostics。根配置与 electron 主/preload 子构建都要用，故集中定义。
const alias = {
  '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
  '@diagnostics': fileURLToPath(new URL('./src/diagnostics', import.meta.url)),
}

// 主进程/preload 编译时，除「项目源码（相对路径、src/ 入口、@shared/@diagnostics 别名、绝对路径）」外一律 external，
// 由运行时 node 从 node_modules 解析（express、cors 及其依赖），避免把整棵依赖树打进 main.js。
const externalizeDeps = (id: string): boolean => {
  if (id === 'electron') return false // electron 由 vite-plugin-electron 处理，不 external（否则 require 解析到 npm 包字符串路径）
  if (id.startsWith('@shared') || id.startsWith('@diagnostics')) return false // 项目别名 → 打包
  if (id.startsWith('.') || id.startsWith('/')) return false // 相对/绝对路径 → 打包
  if (/^[A-Za-z]:[\\/]/.test(id)) return false // Windows 绝对路径（vite 解析后的别名/源码）→ 打包
  if (id.startsWith('src/')) return false // 入口以 src/ 形式传入 → 打包
  return true // 其余裸模块（express、cors、node:path 等）→ external
}

const plugins = [react()]

// 去掉产物 index.html 里 module script 的 crossorigin 属性：
// 从 file:// 加载带 crossorigin 的 module 可能被 CORS 拦截（即使 webSecurity:false 也不 100% 稳），
// 去掉后由 loadFile 直接以同源 file:// 加载，规避潜在的模块加载失败。
plugins.push({
  name: 'strip-crossorigin',
  transformIndexHtml(html: string) {
    return html.replace(/\s+crossorigin/g, '')
  },
})

if (enableElectron) {
  plugins.push(
    electron({
      main: {
        entry: 'src/main/main.ts',
        vite: {
          resolve: { alias },
          build: {
            rollupOptions: {
              external: externalizeDeps,
            },
          },
        },
      },
      preload: {
        input: 'src/preload/preload.ts',
        vite: { resolve: { alias } },
      },
      renderer: process.env.NODE_ENV === 'test' ? undefined : {},
    })
  )
}

export default defineConfig({
  // 相对 base：构建产物用 './assets/...' 相对路径，兼容 Electron loadFile（file:// 加载 asar 内 index.html）
  base: './',
  plugins,
  resolve: {
    alias,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    // 前端 fetch('/api/...') 经此代理同源转发到 Express 能力总线（8787），免去 CORS 烦恼
    // 显式用 127.0.0.1：避免 Windows 上 localhost 解析到 ::1，而 API 只听 IPv4
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        // 拆 vendor 独立 chunk：所有 node_modules 依赖合并为单一 vendor chunk。
        // 注意：不能把 react/react-dom/@emotion 拆进不同 chunk——@emotion 会内联部分 React
        // 内部状态，跨 chunk 拆分会复制 React 实例，导致 __SECRET_INTERNALS 未初始化、
        // 渲染进程直接黑屏（已实际踩坑）。xterm 独立拆出：仅终端页加载，其余页面不拉 334KB。
        manualChunks(id: string): string | undefined {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('@xterm')) return 'xterm'
          return 'vendor'
        },
      },
    },
  },
})
