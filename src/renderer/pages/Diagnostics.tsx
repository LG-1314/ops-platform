import { useEffect, useState } from 'react'
import {
  Grid,
  Box,
  Typography,
  Stack,
  Button,
  MenuItem,
  TextField,
  CircularProgress,
  Alert as MuiAlert,
  Card,
  CardContent,
  Divider,
} from '@mui/material'
import { PlayArrow } from '@mui/icons-material'
import { api } from '../../capabilities/bus'
import type { Asset, DiagnoseResult } from '@shared/types'
import MetricCard from '../components/MetricCard'
import PageHeader from '../components/PageHeader'

export default function Diagnostics() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [assetId, setAssetId] = useState('')
  const [result, setResult] = useState<DiagnoseResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.assets.list().then(setAssets).catch(() => setAssets([]))
  }, [])

  const run = async () => {
    setLoading(true)
    setError('')
    try {
      const r = await api.diagnostics.run(assetId || undefined)
      setResult(r)
    } catch (e) {
      setError((e as Error).message || '体检失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box>
      <PageHeader
        title="系统全栈体检（本机）"
        subtitle="对运行本运维平台的本机进行 CPU / 内存 / 磁盘 / 负载 一键只读诊断"
        actions={
          <Button
            variant="contained"
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <PlayArrow />}
            onClick={run}
            disabled={loading}
          >
            {loading ? '体检中…' : '开始体检'}
          </Button>
        }
      />

      <Stack direction="row" spacing={2} mb={3} alignItems="center">
        <TextField
          select
          size="small"
          label="目标资产"
          value={assetId}
          onChange={(e) => setAssetId(e.target.value)}
          sx={{ minWidth: 260 }}
        >
          <MenuItem value="">本机（默认）</MenuItem>
          {assets.map((a) => (
            <MenuItem key={a.id} value={a.id}>
              {a.name}
            </MenuItem>
          ))}
        </TextField>
        <Typography variant="caption" color="text.secondary">
          体检对象固定为本机（运行本软件的这台机器）；所选资产仅用于把本次体检结果关联到该资产的历史记录，不会改变体检对象。
        </Typography>
      </Stack>

      {error && (
        <MuiAlert severity="error" sx={{ mb: 2 }}>
          {error}
        </MuiAlert>
      )}

      {!result && !loading && (
        <Card>
          <CardContent>
            <Typography variant="body2" color="text.secondary" align="center" py={4}>
              点击「开始体检」即对运行本软件的这台机器实时采集 CPU / 内存 / 磁盘 / 负载等指标，并给出「正常 / 警告 / 严重」评估与优化建议。远程主机的指标请在「主机」页通过 SSH 采集。
            </Typography>
          </CardContent>
        </Card>
      )}

      {result && (
        <Box>
          <Grid container spacing={2}>
            {result.metrics.map((m, i) => (
              <Grid item xs={12} sm={6} md={4} key={i}>
                <MetricCard metric={m} />
              </Grid>
            ))}
          </Grid>

          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>
                优化建议
              </Typography>
              <Divider sx={{ mb: 1.5 }} />
              {result.suggestions.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  各项指标均在正常范围，暂无优化建议。
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {result.suggestions.map((s, i) => (
                    <Typography key={i} variant="body2">
                      • {s}
                    </Typography>
                  ))}
                </Stack>
              )}
              <Typography
                variant="caption"
                color="text.secondary"
                display="block"
                sx={{ mt: 2 }}
              >
                平台：{result.platform} · 主机：{result.host} · 时间：
                {new Date(result.timestamp).toLocaleString()}
              </Typography>
            </CardContent>
          </Card>
        </Box>
      )}
    </Box>
  )
}
