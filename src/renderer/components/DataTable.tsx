import { useState } from 'react'
import {
  Paper,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Typography,
  Box,
  TablePagination,
} from '@mui/material'
import type { ReactNode } from 'react'

export interface Column<T> {
  key: string
  label: string
  render?: (row: T) => ReactNode
  width?: number | string
  align?: 'left' | 'right' | 'center'
  /** 数值列：等宽字体 + tabular-nums（components-spec §2），通常配合 align="right" */
  numeric?: boolean
}

interface Props<T> {
  columns: Column<T>[]
  rows: T[]
  emptyText?: string
  maxHeight?: number
  /** 每页条数，默认 50；>0 时启用内置客户端分页（大列表不卡顿） */
  pageSize?: number
}

export default function DataTable<T extends object>({
  columns,
  rows,
  emptyText = '暂无数据',
  maxHeight,
  pageSize = 50,
}: Props<T>) {
  const [page, setPage] = useState(0)
  const paginated = pageSize > 0

  const total = rows.length
  const maxPage = paginated ? Math.max(0, Math.ceil(total / pageSize) - 1) : 0
  // 轮询刷新（如资产 15s 自动刷新）会传 入新的 rows 数组，但条数通常不变；
  // 此前"数据一变就回第一页"会把正在看第 3 页的用户每 15 秒踢回首页。
  // 改为只在页码超界（删除/过滤后）时收敛到最后一页。
  const safePage = Math.min(page, maxPage)
  const start = paginated ? safePage * pageSize : 0
  const visible = paginated ? rows.slice(start, start + pageSize) : rows

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <Box sx={{ maxHeight, overflow: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              {columns.map((c) => (
                <TableCell
                  key={c.key}
                  width={c.width}
                  align={c.align}
                  sx={{ fontWeight: 600, color: 'text.secondary', whiteSpace: 'nowrap' }}
                >
                  {c.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    {emptyText}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              visible.map((row, i) => {
                const rowRecord = row as Record<string, unknown>
                const rowKey = typeof rowRecord.id === 'string' ? (rowRecord.id as string) : i
                return (
                  <TableRow key={rowKey} hover>
                    {columns.map((c) => (
                      <TableCell
                        key={c.key}
                        align={c.align}
                        sx={{
                          whiteSpace: 'nowrap',
                          ...(c.numeric
                            ? {
                                fontFamily: 'var(--font-mono)',
                                fontVariantNumeric: 'tabular-nums',
                              }
                            : null),
                        }}
                      >
                        {c.render ? c.render(row) : (rowRecord[c.key] as ReactNode)}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </Box>
      {paginated && total > pageSize && (
        <TablePagination
          component="div"
          count={total}
          page={safePage}
          onPageChange={(_e, p) => setPage(p)}
          rowsPerPage={pageSize}
          rowsPerPageOptions={[]}
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} / 共 ${count} 条`}
          labelRowsPerPage=""
        />
      )}
    </Paper>
  )
}
