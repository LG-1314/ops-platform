import { Box } from '@mui/material'
import { useTheme } from '@mui/material/styles'

interface Props {
  size?: number
  withText?: boolean
}

/**
 * 运维全维度管理平台品牌标识。
 * 盾形外壳 + 六边形监测网，表达「全维度守护 / 实时监测」。
 * 渐变取自主题 primary，自动适配深/浅色。
 */
export default function Logo({ size = 28, withText = false }: Props) {
  const theme = useTheme()
  const gradId = `ops-logo-grad-${theme.palette.mode}`
  const c1 = theme.palette.primary.main
  const c2 = theme.palette.info.main

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="运维全维度"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop stopColor={c1} />
            <stop offset="1" stopColor={c2} />
          </linearGradient>
        </defs>
        {/* 盾形外壳 */}
        <path
          d="M24 3L41 9.5V22C41 33.5 33.5 41.5 24 45C14.5 41.5 7 33.5 7 22V9.5L24 3Z"
          fill={`url(#${gradId})`}
          opacity={0.18}
        />
        <path
          d="M24 3L41 9.5V22C41 33.5 33.5 41.5 24 45C14.5 41.5 7 33.5 7 22V9.5L24 3Z"
          stroke={`url(#${gradId})`}
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
        {/* 中心脉冲 + 六边形监测网，与桌面图标同源 */}
        <path
          d="M24 12L32.8 17.2L32.8 26.8L24 32L15.2 26.8L15.2 17.2Z"
          stroke={c1}
          strokeWidth="1.15"
          opacity="0.45"
        />
        <path
          d="M24 22L24 12M24 22L32.8 17.2M24 22L32.8 26.8M24 22L24 32M24 22L15.2 26.8M24 22L15.2 17.2"
          stroke={c2}
          strokeWidth="1.15"
          opacity="0.55"
        />
        <circle cx="24" cy="22" r="3.6" fill={`url(#${gradId})`} />
        <circle cx="24" cy="12" r="1.8" fill={c1} />
        <circle cx="32.8" cy="17.2" r="1.8" fill={c2} />
        <circle cx="32.8" cy="26.8" r="1.8" fill={c1} />
        <circle cx="24" cy="32" r="1.8" fill={c2} />
        <circle cx="15.2" cy="26.8" r="1.8" fill={c1} />
        <circle cx="15.2" cy="17.2" r="1.8" fill={c2} />
      </svg>
      {withText && (
        <Box sx={{ lineHeight: 1.1 }}>
          <Box sx={{ fontWeight: 800, fontSize: 15, letterSpacing: 0.5, color: theme.palette.text.primary }}>
            运维全维度
          </Box>
          <Box sx={{ fontSize: 10, color: theme.palette.text.secondary, letterSpacing: 1 }}>
            OPS COCKPIT
          </Box>
        </Box>
      )}
    </Box>
  )
}
