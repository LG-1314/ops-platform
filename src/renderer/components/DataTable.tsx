import { useEffect, useState } from 'react'
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

  // 数据变化时回到首页，避免停留在超界页
  useEffect(() => {
    setPage(0)
  }, [rows])

  const total = rows.length
  const start = paginated ? page * pageSize : 0
  const visible = paginated ? rows.slice(start, start + pageSize) : rows

  return (
    <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
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
                        sx={{ whiteSpace: 'nowrap' }}
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
          page={page}
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
