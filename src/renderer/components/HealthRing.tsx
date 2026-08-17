import { Box, Typography, CircularProgress, useTheme } from '@mui/material'

interface Props {
  score: number
  size?: number
  label?: string
}

export default function HealthRing({ score, size = 120, label }: Props) {
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
        value={safe}
        size={size}
        thickness={4}
        sx={{ color }}
      />
      <Box
        sx={{
          position: 'absolute',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Typography variant="h5" sx={{ color, fontWeight: 700, lineHeight: 1 }}>
          {safe}
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
