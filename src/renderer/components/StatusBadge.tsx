import { Chip } from '@mui/material'
import { CheckCircle, Warning, Error as ErrorIcon, HelpOutline } from '@mui/icons-material'
import type { ReactElement } from 'react'
import { memo } from 'react'
import { STATUS_COLOR, STATUS_LABEL } from '@shared/constants'
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
  const color = STATUS_COLOR[status]
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
      }}
    />
  )
}

const StatusBadge = memo(StatusBadgeInner)
export default StatusBadge
