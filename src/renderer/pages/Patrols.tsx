import { useEffect, useState } from 'react'
import {
  Grid,
  Box,
  Typography,
  Stack,
  Button,
  Card,
  CardContent,
  Divider,
  CircularProgress,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Tabs,
  Tab,
} from '@mui/material'
import { PlayArrow, Add } from '@mui/icons-material'
import { api } from '../../capabilities/bus'
import type { PatrolTask, PatrolLayer, PatrolRun, Status } from '@shared/types'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import { Alert as MuiAlert } from '@mui/material'

const LAYER_LABEL: Record<PatrolLayer, string> = {
  basic: '基础资源',
  middleware: '中间件',
  container: '容器',
  log: '日志',
  business: '业务',
}

function runStatus(s: string): Status {
  if (s === 'failed') return 'error'
  if (s === 'running') return 'warn'
  if (s === 'success') return 'ok'
  return 'unknown'
}

export default function Patrols() {
  const [tasks, setTasks] = useState<PatrolTask[]>([])
  const [loading, setLoading] = useState(true)
  const [runningId, setRunningId] = useState('')
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [cron, setCron] = useState('0 * * * *')
  const [layers, setLayers] = useState<PatrolLayer[]>(['basic'])
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    setError('')
    api.patrols
      .list()
      .then(setTasks)
      .catch((e) => setError((e as Error).message || '加载失败'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const run = async (id: string) => {
    setRunningId(id)
    setError('')
    try {
      await api.patrols.run(id)
      load()
    } catch (e) {
      setError((e as Error).message || '执行失败')
    } finally {
      setRunningId('')
    }
  }

  const create = async () => {
    setError('')
    try {
      await api.patrols.create({ name, cron, layers, enabled: true })
      setOpen(false)
      setName('')
      setLayers(['basic'])
      load()
    } catch (e) {
      setError((e as Error).message || '创建失败')
    }
  }

  return (
    <Box>
      <PageHeader
        title="智能巡检"
        subtitle="基础资源 / 中间件 / 容器 / 日志 / 业务 多层巡检编排"
        actions={
          <Button variant="contained" startIcon={<Add />} onClick={() => setOpen(true)}>
            新建巡检
          </Button>
        }
      />

      {error && (
        <MuiAlert severity="error" sx={{ mb: 2 }}>
          {error}
        </MuiAlert>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress />
        </Box>
      ) : (
        <Grid container spacing={2}>
          {tasks.map((t) => (
            <Grid item xs={12} md={6} key={t.id}>
              <Card>
                <CardContent>
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <Typography variant="subtitle1">{t.name}</Typography>
                    <StatusBadge
                      status={runStatus(t.status)}
                      label={t.status}
                    />
                  </Stack>
                  <Divider sx={{ my: 1.5 }} />
                  <Stack direction="row" spacing={0.5} mb={1} flexWrap="wrap" useFlexGap>
                    {t.layers.map((l) => (
                      <Chip key={l} size="small" label={LAYER_LABEL[l]} color="primary" variant="outlined" />
                    ))}
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    Cron：{t.cron}
                    {t.lastRunAt
                      ? ` · 上次执行：${new Date(t.lastRunAt).toLocaleString()}`
                      : ' · 尚未执行'}
                  </Typography>

                  <Box mt={1.5}>
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={
                        runningId === t.id ? (
                          <CircularProgress size={16} color="inherit" />
                        ) : (
                          <PlayArrow />
                        )
                      }
                      disabled={runningId === t.id}
                      onClick={() => run(t.id)}
                    >
                      {runningId === t.id ? '执行中…' : '立即执行'}
                    </Button>
                  </Box>

                  {t.history.length > 0 && (
                    <Box mt={1.5}>
                      <Typography variant="caption" color="text.secondary">
                        最近执行
                      </Typography>
                      {t.history.slice(-2).reverse().map((h: PatrolRun) => (
                        <Box
                          key={h.id}
                          sx={{
                            mt: 0.5,
                            p: 1,
                            bgcolor: 'action.hover',
                            borderRadius: 1,
                          }}
                        >
                          <Stack direction="row" spacing={1} alignItems="center">
                            <StatusBadge status={runStatus(h.status)} label={h.status} />
                            <Typography variant="caption">
                              {new Date(h.startedAt).toLocaleString()}
                            </Typography>
                          </Stack>
                          <Typography variant="caption" color="text.secondary">
                            {h.summary}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogTitle>新建巡检任务</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1, minWidth: 360 }}>
            <TextField
              label="任务名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <TextField
              label="Cron 表达式"
              value={cron}
              onChange={(e) => setCron(e.target.value)}
            />
            <Tabs
              value={0}
              variant="scrollable"
              sx={{ borderBottom: 1, borderColor: 'divider' }}
            >
              {(['basic', 'middleware', 'container', 'log', 'business'] as PatrolLayer[]).map(
                (l) => (
                  <Tab
                    key={l}
                    label={LAYER_LABEL[l]}
                    onClick={() =>
                      setLayers((prev) =>
                        prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]
                      )
                    }
                  />
                )
              )}
            </Tabs>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              {layers.map((l) => (
                <Chip key={l} size="small" label={LAYER_LABEL[l]} color="primary" />
              ))}
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>取消</Button>
          <Button variant="contained" onClick={create} disabled={!name}>
            创建
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
