import type { Request, Response, NextFunction } from 'express'
import type { ApiResponse, ApiError } from '@shared/types'

/** 成功信封：{ code:0, data, message } */
export function ok<T>(res: Response, data: T, message = 'ok'): Response {
  const body: ApiResponse<T> = { code: 0, data, message }
  return res.status(200).json(body)
}

/** 失败信封：{ code:非零, message, detail? } */
export function fail(
  res: Response,
  code: number,
  message: string,
  detail?: string
): Response {
  const body: ApiError = { code, message, detail }
  return res.status(200).json(body)
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

/** 统一错误兜底（code 500） */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // eslint-disable-next-line no-console
  console.error('[ops-platform] unhandled error:', err)
  fail(res, 500, 'Internal Server Error', err.message)
}
