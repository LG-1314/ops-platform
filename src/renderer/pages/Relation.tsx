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
} from '@mui/material'
import { AccountTree, Assignment, ConfirmationNumber, MenuBook, Link } from '@mui/icons-material'
import { api } from '../../capabilities/bus'
import type { Asset, RelatedProject } from '@shared/types'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import EmptyState from '../components/EmptyState'

export default function Relation() {
  const theme = useTheme()
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
        sx={{ minWidth: 260, mb: 3 }}
      >
        {assets.map((a) => (
          <MenuItem key={a.id} value={a.id}>
            {a.name}
          </MenuItem>
        ))}
      </TextField>

      {loading && (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress />
        </Box>
      )}

      {!loading && relations.length === 0 && (
        <Card>
          <CardContent>
            <EmptyState text="该资产暂无关联的的项目 / 工单 / 知识文档" icon={<Link />} />
          </CardContent>
        </Card>
      )}

      <Grid container spacing={2}>
        {relations.map((r, i) => (
          <Grid item xs={12} md={4} key={i}>
            <Card sx={{ height: '100%' }}>
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
                      <Typography variant="caption" color="text.secondary">
                        项目
                      </Typography>
                    </Stack>
                    <Typography variant="body2">{r.project || '—'}</Typography>
                  </Box>
                  <Box>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <ConfirmationNumber fontSize="small" color="action" />
                      <Typography variant="caption" color="text.secondary">
                        工单
                      </Typography>
                    </Stack>
                    <Typography variant="body2">{r.ticket || '—'}</Typography>
                  </Box>
                  <Box>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <MenuBook fontSize="small" color="action" />
                      <Typography variant="caption" color="text.secondary">
                        知识文档
                      </Typography>
                    </Stack>
                    <Typography variant="body2">{r.knowledge || '—'}</Typography>
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

      {asset && (
        <Box mt={2}>
          <StatusBadge status="ok" label={`关联资产：${assets.find((a) => a.id === asset)?.name ?? asset}`} />
        </Box>
      )}
    </Box>
  )
}
