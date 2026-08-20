import { LineChart } from '@mui/x-charts/LineChart'
import { useTheme } from '@mui/material/styles'

export interface TrendPoint {
  t: string
  v: number
}

interface Props {
  label: string
  data: TrendPoint[]
  color?: string
  height?: number
}

/** 轻量折线图封装：基于 @mui/x-charts（MUI 官方，天然继承主题令牌），
 *  统一配色 / 面积填充 / 点标记 / 坐标轴样式，避免散落硬编码。 */
export default function MetricLineChart({ label, data, color, height = 140 }: Props) {
  const theme = useTheme()
  if (data.length === 0) return null
  const c = color || theme.palette.primary.main
  return (
    <LineChart
      height={height}
      xAxis={[{ scaleType: 'point', data: data.map((d) => d.t) }]}
      series={[
        {
          data: data.map((d) => d.v),
          label,
          color: c,
          area: true,
          showMark: data.length <= 40,
          curve: 'linear',
        },
      ]}
      margin={{ top: 8, bottom: 24, left: 40, right: 12 }}
      sx={{
        '& .MuiAreaElement-root': { fill: `${c}22` },
        '& .MuiChartsAxis-tickLabel': { fill: theme.palette.text.secondary, fontSize: 11 },
        '& .MuiChartsAxis-line, & .MuiChartsAxis-tick': { stroke: theme.palette.divider },
      }}
    />
  )
}
