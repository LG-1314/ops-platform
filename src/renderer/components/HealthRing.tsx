import { Box, Typography, CircularProgress, useTheme } from '@mui/material'

interface Props {
  score: number
  size?: number
  label?: string
  /** 主机离线 / 未探测时传 true：环显示 '-' 而非 0 分，避免误读为"健康 0 分" */
  unavailable?: boolean
}

export default function HealthRing({ score, size = 120, label, unavailable = false }: Props) {
  const theme = useTheme()
  const safe = Math.max(0, Math.min(100, score))
  const color = safe >= 80 ? theme.palette.success.main : safe >= 60 ? theme.palette.warning.main : theme.palette.error.main
  return (
    <Box
      sx={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <CircularProgress
        variant="determinate"
        value={unavailable ? 0 : safe}
        size={size}
        thickness={4}
        sx={{ color: unavailable ? theme.palette.text.disabled : color }}
      />
      <Box
        sx={{
          position: 'absolute',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Typography variant="h5" sx={{ color: unavailable ? theme.palette.text.disabled : color, fontWeight: 700, lineHeight: 1 }}>
          {unavailable ? '—' : safe}
        </Typography>
        {label && (
          <Typography variant="caption" color="text.secondary">
            {label}
          </Typography>
        )}
      </Box>
    </Box>
  )
}
