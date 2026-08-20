import { contextBridge, ipcRenderer } from 'electron'

// 渲染进程未捕获错误 / 未处理 Promise rejection 一律转发到主进程写日志。
// 比 webContents 的 console-message 更可靠：能暴露任何运行时异常（含不打印 console 的崩溃）。
function reportRendererError(kind: string, e: unknown): void {
  try {
    const msg = e instanceof Error ? `${e.message}\n${e.stack || ''}` : String(e)
    ;(window as any).__opsRendererErrors = (window as any).__opsRendererErrors || []
    ;(window as any).__opsRendererErrors.push({ kind, msg })
    ipcRenderer.send('renderer-error', { kind, msg })
  } catch {
    /* ignore */
  }
}
window.addEventListener('error', (ev) => reportRendererError('error', ev.error || ev.message))
window.addEventListener('unhandledrejection', (ev) =>
  reportRendererError('unhandledrejection', (ev as PromiseRejectionEvent).reason)
)

// DOM/样式探针：页面加载后把真实渲染状态发回主进程，定位"窗口能开但内容黑屏"
setTimeout(() => {
  try {
    const root = document.getElementById('root')
    const body = document.body
    const info = {
      kind: 'dom-probe-preload',
      url: location.href,
      rootChildren: root ? root.childElementCount : -1,
      rootLen: root ? root.innerHTML.length : 0,
      bodyLen: body ? body.innerHTML.length : 0,
      styleTags: document.querySelectorAll('style').length,
      emotionNodes: document.querySelectorAll('[data-emotion]').length,
      muiNodes: document.querySelectorAll('[class*="Mui"], [class*="muirtl"]').length,
      firstH1: document.querySelector('h1')?.textContent || null,
      bodyBg: body ? getComputedStyle(body).backgroundColor : null,
      rootBg: root ? getComputedStyle(root).backgroundColor : null,
      scripts: document.scripts.length,
      errors: (window as any).__opsRendererErrors || [],
    }
    ipcRenderer.send('renderer-error', { kind: 'dom-probe', msg: JSON.stringify(info) })
  } catch (e) {
    reportRendererError('dom-probe-error', e)
  }
}, 3500)

// API 经 ipc 由主进程 Node 转发 Express（端口动态注入），完全不经过 Chromium
// 出站网络，避开本机代理/防火墙对 127.0.0.1 的拦截（之前 loadURL http 与自定义
// 协议导航都因同一问题 ERR_FAILED）。apiBase 仍保留供终端 WebSocket 地址推导。
const api = {
  version: (): string => process.versions.electron ?? '0.0.0',
  ping: (): Promise<string> => ipcRenderer.invoke('ping').catch(() => 'no-handler'),
  apiBase: `http://127.0.0.1:${process.env.OPS_API_PORT || '8787'}/api`,
  // 取回能力总线令牌（终端 WebSocket 鉴权用），返回 Promise<string>
  token: (): Promise<string> => ipcRenderer.invoke('ops-auth-token').catch(() => ''),
  request: (method: string, path: string, body?: unknown, userToken?: string): Promise<unknown> =>
    ipcRenderer.invoke('ops-api', { method, path, body, userToken }),
}

contextBridge.exposeInMainWorld('opsApi', api)

export type OpsApi = typeof api
