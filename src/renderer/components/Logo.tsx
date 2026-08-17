import { Box } from '@mui/material'
import { useTheme } from '@mui/material/styles'

interface Props {
  size?: number
  withText?: boolean
}

/**
 * 运维全维度管理平台品牌标识。
 * 盾形外壳 + 内部脉冲节点，表达「全维度守护 / 实时监测」。
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
        {/* 中心脉冲节点 */}
        <circle cx="24" cy="22" r="4.2" fill={`url(#${gradId})`} />
        {/* 环绕监测点 */}
        <circle cx="24" cy="11" r="2" fill={c1} />
        <circle cx="35" cy="20" r="2" fill={c2} />
        <circle cx="30" cy="33" r="2" fill={c1} />
        <circle cx="18" cy="33" r="2" fill={c2} />
        <circle cx="13" cy="20" r="2" fill={c1} />
        {/* 连接线 */}
        <path
          d="M24 11L24 17.8M35 20L28.2 21.4M30 33L26.2 25.4M18 33L21.8 25.4M13 20L19.8 21.4"
          stroke={c1}
          strokeWidth="1.2"
          opacity="0.5"
        />
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
