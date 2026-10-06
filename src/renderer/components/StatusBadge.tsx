import { Chip } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { CheckCircle, Warning, Error as ErrorIcon, HelpOutline } from '@mui/icons-material'
import type { ReactElement } from 'react'
import { memo } from 'react'
import { STATUS_LABEL } from '@shared/constants'
import type { Status } from '@shared/types'

// 状态 -> 语义图标（统一 @mui/icons-material，替换原 emoji 功能图标）
const STATUS_ICON: Record<Status, ReactElement> = {
  ok: <CheckCircle />,
  warn: <Warning />,
  error: <ErrorIcon />,
  unknown: <HelpOutline />,
}

interface Props {
  status: Status
  label?: string
}

function StatusBadgeInner({ status, label }: Props) {
  // 颜色取自主题语义色（随深浅模式切换）。此前硬编码深色模式 hex，
  // 浅色底上 1A 透明度对比度不足；unknown 用 disabled 灰而不是游离的 #9E9E9E。
  const theme = useTheme()
  const color =
    status === 'ok'
      ? theme.palette.success.main
      : status === 'warn'
        ? theme.palette.warning.main
        : status === 'error'
          ? theme.palette.error.main
          : theme.palette.text.disabled
  return (
    <Chip
      size="small"
      icon={STATUS_ICON[status]}
      label={label ?? STATUS_LABEL[status]}
      sx={{
        bgcolor: `${color}1A`,
        color,
        fontWeight: 600,
        border: `1px solid ${color}33`,
        height: 24,
        '& .MuiChip-icon': { color },
      }}
    />
  )
}

const StatusBadge = memo(StatusBadgeInner)
export default StatusBadge
