// 通用列表分页：当请求带合法 page/pageSize 时返回 {items,total,page,pageSize}，
// 否则原样返回数组（向后兼容既有前端调用）。零依赖。

export interface PageResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export function paginate<T>(
  arr: T[],
  query: Record<string, unknown>
): T[] | PageResult<T> {
  const page = Number(query.page)
  const pageSize = Number(query.pageSize)
  if (!Number.isInteger(page) || !Number.isInteger(pageSize) || page < 1 || pageSize < 1) {
    return arr
  }
  const total = arr.length
  const start = (page - 1) * pageSize
  return { items: arr.slice(start, start + pageSize), total, page, pageSize }
}
