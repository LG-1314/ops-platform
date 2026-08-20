import { useEffect, useState } from 'react'
import {
  Grid,
  Box,
  Typography,
  Stack,
  MenuItem,
  TextField,
  Card,
  CardContent,
  Divider,
  CircularProgress,
  Chip,
  Alert as MuiAlert,
  useTheme,
  IconButton,
  Tooltip,
} from '@mui/material'
import {
  AccountTree,
  Assignment,
  ConfirmationNumber,
  MenuBook,
  Link,
  Search as IconSearch,
  OpenInNew,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import { api } from '../../capabilities/bus'
import type { Asset, RelatedProject } from '@shared/types'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import EmptyState from '../components/EmptyState'

export default function Relation() {
  const theme = useTheme()
  const navigate = useNavigate()
  const [assets, setAssets] = useState<Asset[]>([])
  const [asset, setAsset] = useState('')
  const [relations, setRelations] = useState<RelatedProject[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.assets
      .list()
      .then((a) => {
        setAssets(a)
        if (a.length) setAsset(a[0].id)
      })
      .catch((e) => setError((e as Error).message || '加载资产失败'))
  }, [])

  useEffect(() => {
    if (!asset) return
    setLoading(true)
    setError('')
    api.relations
      .of(asset)
      .then(setRelations)
      .catch((e) => setError((e as Error).message || '加载关联关系失败'))
      .finally(() => setLoading(false))
  }, [asset])

  const currentAsset = assets.find((a) => a.id === asset)

  // 关联知识 → 跳知识检索（预填关键词）
  const goKnowledge = (keywords: string) => {
    const first = keywords.trim().split(/\s+/)[0] || ''
    navigate(`/knowledge?q=${encodeURIComponent(first)}`)
  }

  return (
    <Box>
      <PageHeader
        title="可查资料和相关项目"
        subtitle="以资产为中心，聚合其关联的项目 / 工单 / 知识文档"
      />

      {error && (
        <MuiAlert severity="error" sx={{ mb: 2 }}>
          {error}
        </MuiAlert>
      )}

      <TextField
        select
        size="small"
        label="选择资产"
        value={asset}
        onChange={(e) => setAsset(e.target.value)}
        sx={{ minWidth: 300, mb: 3 }}
      >
        {assets.map((a) => (
          <MenuItem key={a.id} value={a.id}>
            {a.name}（{a.host}{a.type ? ` · ${a.type}` : ''}）
          </MenuItem>
        ))}
      </TextField>

      {/* 当前资产概览 */}
      {currentAsset && (
        <Stack direction="row" spacing={1} alignItems="center" mb={2} flexWrap="wrap" useFlexGap>
          <StatusBadge status={currentAsset.status} />
          <Chip size="small" label={`健康分 ${currentAsset.healthScore}`} variant="outlined" />
          <Chip size="small" label={currentAsset.reachable ? '在线' : currentAsset.reachable === false ? '离线' : '未探测'} variant="outlined" />
          <Box sx={{ flexGrow: 1 }} />
          <Tooltip title="打开资产纳管">
            <IconButton size="small" onClick={() => navigate(`/assets?q=${encodeURIComponent(currentAsset.name)}`)}>
              <OpenInNew fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      )}

      {loading && (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress />
        </Box>
      )}

      {!loading && relations.length === 0 && (
        <Card>
          <CardContent>
            <EmptyState
              text="该资产暂无关联的项目 / 工单 / 知识文档"
              description="可在「资产纳管」完善资产信息，或从「知识检索」中查找相关知识"
              icon={<Link />}
            />
          </CardContent>
        </Card>
      )}

      <Grid container spacing={2}>
        {relations.map((r, i) => (
          <Grid item xs={12} md={4} key={`${r.ticket}-${i}`}>
            <Card sx={{ height: '100%', '&:hover': { borderColor: theme.palette.primary.main } }}>
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                  <AccountTree sx={{ color: theme.palette.primary.main }} />
                  <Typography variant="subtitle1">资产关联</Typography>
                </Stack>
                <Divider sx={{ mb: 1.5 }} />
                <Stack spacing={1.5}>
                  <Box>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Assignment fontSize="small" color="action" />
                      <Typography variant="caption" color="text.secondary">项目</Typography>
                    </Stack>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{r.project || '—'}</Typography>
                  </Box>
                  <Box>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <ConfirmationNumber fontSize="small" color="action" />
                      <Typography variant="caption" color="text.secondary">工单</Typography>
                    </Stack>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{r.ticket || '—'}</Typography>
                  </Box>
                  <Box>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <MenuBook fontSize="small" color="action" />
                      <Typography variant="caption" color="text.secondary">知识文档</Typography>
                    </Stack>
                    {r.knowledge ? (
                      <Chip
                        size="small"
                        icon={<IconSearch sx={{ fontSize: 14 }} />}
                        label={r.knowledge}
                        color="primary"
                        variant="outlined"
                        sx={{ mt: 0.5, cursor: 'pointer' }}
                        onClick={() => goKnowledge(r.knowledge)}
                        clickable
                      />
                    ) : (
                      <Typography variant="body2" color="text.secondary">—</Typography>
                    )}
                  </Box>
                  {r.note && (
                    <Chip size="small" label={r.note} variant="outlined" sx={{ alignSelf: 'flex-start' }} />
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {asset && !loading && relations.length > 0 && (
        <Box mt={2}>
          <StatusBadge status="ok" label={`关联资产：${currentAsset?.name ?? asset}`} />
        </Box>
      )}
    </Box>
  )
}
