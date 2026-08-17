// 跨端共享常量：前端（bus.ts）与后端（index.ts）共用。
// 纯 TS，不引入任何 node / 浏览器专属 API，确保两端可安全导入。

/** 前端统一调用前缀（相对同源）；后端端口见 DEFAULT_PORT */
export const API_BASE = '/api'

/** Express 能力总线默认端口 */
export const DEFAULT_PORT = 8787

/** 状态 -> 颜色（与 theme.ts / tailwind.config.js 保持一致） */
export const STATUS_COLOR: Record<Status, string> = {
  ok: '#2E7D32',
  warn: '#ED6C02',
  error: '#D32F2F',
  unknown: '#9E9E9E',
}

/** 状态 -> 中文文案 */
export const STATUS_LABEL: Record<Status, string> = {
  ok: '正常',
  warn: '警告',
  error: '严重',
  unknown: '未知',
}

/** 主题 token（与 renderer/theme.ts 保持一致，便于非 MUI 场景使用） */
export const THEME_TOKEN = {
  primary: '#1E3A8A',
  secondary: '#3949AB',
  background: '#F5F7FA',
  card: '#FFFFFF',
  borderRadius: 12,
}

// 局部类型，避免本文件反向依赖 shared/types 造成循环（常量文件应保持零业务依赖）
type Status = 'ok' | 'warn' | 'error' | 'unknown'
