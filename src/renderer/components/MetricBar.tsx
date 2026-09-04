import { memo } from 'react'
import { Box, Stack, Typography, LinearProgress } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { THRESHOLD_DANGER, THRESHOLD_WARNING } from '@shared/constants'

interface MetricBarProps {
  label: string
  pct?: number
  /** 紧凑模式：用于表格内嵌展示 */
  compact?: boolean
}

function MetricBarInner({ label, pct, compact }: MetricBarProps) {
  const theme = useTheme()
  if (pct == null) return null
  const color =
    pct >= THRESHOLD_DANGER
      ? theme.palette.error.main
      : pct >= THRESHOLD_WARNING
        ? theme.palette.warning.main
        : theme.palette.success.main

  if (compact) {
    return (
      <Stack direction="row" alignItems="center" spacing={0.6} sx={{ minWidth: 96 }}>
        <Typography variant="caption" color="text.secondary" sx={{ width: 34, fontSize: 10, flexShrink: 0 }}>
          {label}
        </Typography>
        <LinearProgress
          variant="determinate"
          value={pct}
          sx={{
            flex: 1,
            height: 4,
            borderRadius: 2,
            '& .MuiLinearProgress-bar': { backgroundColor: color },
          }}
        />
        <Typography
          variant="caption"
          sx={{
            width: 34,
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            fontVariantNumeric: 'tabular-nums',
            color,
            textAlign: 'right',
            flexShrink: 0,
          }}
        >
          {pct}%
        </Typography>
      </Stack>
    )
  }

  return (
    <Box sx={{ mb: 1.5 }}>
      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Typography variant="body2">{label}</Typography>
        <Typography
          variant="body2"
          sx={{
            fontFamily: 'var(--font-mono)',
            fontVariantNumeric: 'tabular-nums',
            color,
          }}
        >
          {pct}%
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={pct}
        sx={{
          height: 6,
          borderRadius: 3,
          '& .MuiLinearProgress-bar': { backgroundColor: color },
        }}
      />
    </Box>
  )
}

const MetricBar = memo(MetricBarInner)
export default MetricBar
