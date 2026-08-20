import type { Request, Response, NextFunction } from 'express'
import type { ApiResponse, ApiError } from '@shared/types'
import { logger } from './logger'

/**
 * 成功信封：{ code:0, data, message }
 * 统一返回 HTTP 200（信封内 code 表达业务结果）。
 */
export function ok<T>(res: Response, data: T, message = 'ok'): Response {
  const body: ApiResponse<T> = { code: 0, data, message }
  return res.status(200).json(body)
}

/**
 * 失败信封：HTTP 状态码透传 code（400/401/403/404/409/422/500...），
 * 不再恒返 200，便于网关/前端/监控按状态码判错；业务结果同时在信封 code 内回显。
 */
export function fail(
  res: Response,
  code: number,
  message: string,
  detail?: string
): Response {
  const body: ApiError = { code, message, detail }
  return res.status(code >= 400 && code < 600 ? code : 400).json(body)
}

/** 包裹 async 路由处理器，统一把异常交给 errorHandler */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

/** 404 兜底 */
export function notFoundHandler(_req: Request, res: Response): void {
  fail(res, 404, 'Not Found')
}

/**
 * 统一错误兜底（code 500）。
 * 安全：对外只返回通用文案，内部 err.message 仅服务端日志，绝不回显到客户端（防内网拓扑/路径泄露）。
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error(`unhandled error: ${err?.stack || err?.message || String(err)}`)
  fail(res, 500, 'Internal Server Error')
}
