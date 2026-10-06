import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { CacheProvider } from '@emotion/react'
import createCache from '@emotion/cache'
import { HashRouter } from 'react-router-dom'
import { ThemeModeProvider } from './state/ThemeModeProvider'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'


// file:// 加载 + webSecurity:false 时，emotion 的 speedy 模式（insertRule）可能因安全限制失败，
// 导致 MUI 样式完全不生效 → 主内容区组件无样式、加载态 spinner 不可见 → 视觉黑屏。
// 强制 speedy:false 改用 <style> 文本注入，100% 可靠；prepend 等价于 injectFirst。
const muiCache = createCache({ key: 'mui', speedy: false, prepend: true })

// 首屏渲染健康探针：把渲染/路由/API 真实状态常驻在顶部诊断条，
// 仅在异常（样式未注入、API 出错、仍在加载）时显示，正常时自动隐藏。
// 目的：把"无声黑屏"变成可截图定位的诊断信息。Dashboard 会把状态写入 window.__opsDash。
function RenderProbe() {
  const [diag, setDiag] = useState('')
  const [color, setColor] = useState('#D32F2F')
  useEffect(() => {
    // 生产环境不显示诊断条（黑屏诊断由主进程 dom-probe 写入日志），避免误弹红色条干扰正常使用
    if (!import.meta.env.DEV) return
    const collect = () => {
      const dash = (window as any).__opsDash
      const root = document.getElementById('root')
      const mui = document.querySelectorAll('[class*="Mui"], [class*="muirtl"]').length
      const emotion = document.querySelectorAll('[data-emotion]').length
      const cards = document.querySelectorAll('[class*="MuiCard"]').length
      const h1 = document.querySelector('h1')?.textContent || null
      return { dash, mui, emotion, cards, h1, rootChildren: root?.childElementCount }
    }
    const tick = () => {
      const r = collect()
      const phase = r.dash?.phase
      // 仅在异常时显示：样式未注入、API 出错、或仍在加载（默认路由尚未就绪时 phase 为 undefined，先不报）
      const abnormal = r.mui < 10 || phase === 'error' || phase === 'loading'
      if (abnormal) {
        setColor(phase === 'loading' ? '#3D7BFF' : '#D32F2F')
        setDiag(
          `route=${location.hash || '(空)'} phase=${phase || '?'} mui=${r.mui} emotion=${r.emotion} cards=${r.cards} h1=${r.h1}` +
            (r.dash?.error ? ` err=${r.dash.error}` : '')
        )
      } else {
        setDiag('')
      }
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [])
  if (!diag) return null
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        background: color,
        color: '#ffffff',
        padding: '8px 12px',
        fontFamily: 'var(--font-mono)',
        fontSize: '13px',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
      }}
    >
      渲染诊断: {diag}
    </div>
  )
}

// 渲染进程入口：挂载 App，包裹 MUI 样式缓存、主题、路由与渲染异常边界。
// 生产态使用 loadFile(file://) 加载，BrowserRouter 的 pushState 会把路径改成 file:///F:/xxx
// 这种非法 file URL，导致子路由匹配失败、<Outlet /> 渲染为空 → 主内容区黑屏。
// HashRouter 使用 location.hash 管理路由，与 file:// 完全兼容。
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <CacheProvider value={muiCache}>
      <ThemeModeProvider>
        <HashRouter>
          <ErrorBoundary>
            <App />
            <RenderProbe />
          </ErrorBoundary>
        </HashRouter>
      </ThemeModeProvider>
    </CacheProvider>
  </React.StrictMode>
)
