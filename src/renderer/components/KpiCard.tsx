import { Card, CardContent, Typography, Box, useTheme } from '@mui/material'
import type { ReactNode } from 'react'

interface Props {
  title: string
  value: ReactNode
  sub?: string
  icon?: ReactNode
  color?: string
}

export default function KpiCard({
  title,
  value,
  sub,
  icon,
  color,
}: Props) {
  const theme = useTheme()
  const iconColor = color ?? theme.palette.primary.main
  return (
    <Card>
      <CardContent>
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="flex-start"
          gap={1}
        >
          <Box minWidth={0}>
            <Typography variant="caption" color="text.secondary">
              {title}
            </Typography>
            <Typography
              variant="h5"
              sx={{ fontWeight: 700, lineHeight: 1.2 }}
            >
              {value}
            </Typography>
            {sub && (
              <Typography variant="caption" color="text.secondary">
                {sub}
              </Typography>
            )}
          </Box>
            {icon && (
              <Box
                sx={{
                  color: iconColor,
                  width: 44,
                  height: 44,
                  borderRadius: 2,
                  bgcolor: `${iconColor}1A`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  '& .MuiSvgIcon-root': { fontSize: 24 },
                }}
              >
                {icon}
              </Box>
            )}
        </Box>
      </CardContent>
    </Card>
  )
}
