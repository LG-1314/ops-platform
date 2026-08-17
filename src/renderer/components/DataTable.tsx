import {
  Paper,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Typography,
  Box,
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
}

export default function DataTable<T extends object>({
  columns,
  rows,
  emptyText = '暂无数据',
  maxHeight,
}: Props<T>) {
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
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    {emptyText}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, i) => (
                <TableRow key={i} hover>
                  {columns.map((c) => (
                    <TableCell
                      key={c.key}
                      align={c.align}
                      sx={{ whiteSpace: 'nowrap' }}
                    >
                      {c.render ? c.render(row) : ((row as Record<string, unknown>)[c.key] as ReactNode)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Box>
    </Paper>
  )
}
