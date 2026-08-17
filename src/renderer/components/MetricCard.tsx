import { Card, CardContent, Typography, Box } from '@mui/material'
import StatusBadge from './StatusBadge'
import type { Metric } from '@shared/types'

interface Props {
  metric: Metric
}

export default function MetricCard({ metric }: Props) {
  return (
    <Card>
      <CardContent>
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          gap={1}
        >
          <Typography variant="subtitle1">{metric.name}</Typography>
          <StatusBadge status={metric.status} />
        </Box>
        <Typography variant="h5" sx={{ my: 1, fontWeight: 700, lineHeight: 1.2 }}>
          {metric.value}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          正常范围：{metric.normal}
        </Typography>
        {metric.detail && (
          <Typography
            variant="caption"
            display="block"
            color="text.secondary"
            sx={{ mt: 0.5 }}
          >
            {metric.detail}
          </Typography>
        )}
      </CardContent>
    </Card>
  )
}
