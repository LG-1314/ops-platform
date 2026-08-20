// 跨端共享常量：前端（bus.ts）与后端（index.ts）共用。
// 纯 TS，不引入任何 node / 浏览器专属 API，确保两端可安全导入。

/** 前端统一调用前缀（相对同源）；后端端口见 DEFAULT_PORT */
export const API_BASE = '/api'

/** Express 能力总线默认端口 */
export const DEFAULT_PORT = 8787

/** 状态 -> 颜色（与 theme.ts / design-tokens.json 主题令牌保持一致：success/warning/danger） */
export const STATUS_COLOR: Record<Status, string> = {
  ok: '#34D399',
  warn: '#F59E0B',
  error: '#F87171',
  unknown: '#9E9E9E',
}

/** 状态 -> 中文文案 */
export const STATUS_LABEL: Record<Status, string> = {
  ok: '正常',
  warn: '警告',
  error: '严重',
  unknown: '未知',
}

// 局部类型，避免本文件反向依赖 shared/types 造成循环（常量文件应保持零业务依赖）
type Status = 'ok' | 'warn' | 'error' | 'unknown'
