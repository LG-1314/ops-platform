import { Box, Typography, useTheme } from '@mui/material'
import { Inbox } from '@mui/icons-material'
import type { ReactNode } from 'react'

interface Props {
  text: string
  description?: string
  icon?: ReactNode
}

// 精致空状态：渐变光晕 + 虚线环 + 语义图标，theme-aware，覆盖全站“暂无数据”场景。
export default function EmptyState({ text, description, icon = <Inbox /> }: Props) {
  const theme = useTheme()
  const primary = theme.palette.primary.main
  const info = theme.palette.info.main
  return (
    <Box textAlign="center" py={6}>
      <Box
        sx={{
          position: 'relative',
          width: 104,
          height: 104,
          mx: 'auto',
          mb: 2,
        }}
      >
        {/* 渐变光晕 */}
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: `radial-gradient(circle at 30% 30%, ${primary}26, ${info}14 70%)`,
          }}
        />
        {/* 虚线环 */}
        <Box
          sx={{
            position: 'absolute',
            inset: 8,
            borderRadius: '50%',
            border: `1.5px dashed ${theme.palette.divider}`,
          }}
        />
        {/* 图标 */}
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: primary,
            opacity: 0.85,
            '& .MuiSvgIcon-root': { fontSize: 40 },
          }}
        >
          {icon}
        </Box>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
        {text}
      </Typography>
      {description && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, opacity: 0.8 }}>
          {description}
        </Typography>
      )}
    </Box>
  )
}
