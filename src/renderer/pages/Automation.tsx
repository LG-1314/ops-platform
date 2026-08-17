import { useEffect, useState } from 'react'
import {
  Grid,
  Box,
  Typography,
  Stack,
  Card,
  CardContent,
  Divider,
  CircularProgress,
  Chip,
  Alert as MuiAlert,
  useTheme,
} from '@mui/material'
import { BugReport, AccountTree } from '@mui/icons-material'
import { api } from '../../capabilities/bus'
import type { Incident, CicdPipeline, AlertLevel, IncidentState, Status } from '@shared/types'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import EmptyState from '../components/EmptyState'

function incidentStatus(s: string): Status {
  if (s === 'open') return 'error'
  if (s === 'investigating') return 'warn'
  if (s === 'postmortem') return 'unknown'
  return 'ok'
}
function levelStatus(l: string): Status {
  if (l === 'P0' || l === 'P1') return 'error'
  if (l === 'P2') return 'warn'
  return 'unknown'
}
function cicdStatus(s: string): Status {
  if (s === 'failed') return 'error'
  if (s === 'running') return 'warn'
  if (s === 'pending') return 'unknown'
  return 'ok'
}

const STATE_LABEL: Record<IncidentState, string> = {
  open: '待处理',
  investigating: '排查中',
  resolved: '已解决',
  postmortem: '复盘',
}

export default function Automation() {
  const theme = useTheme()
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [cicd, setCicd] = useState<CicdPipeline[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api.automation.incidents(), api.automation.cicd()])
      .then(([i, c]) => {
        setIncidents(i)
        setCicd(c)
      })
      .catch((e) => setError((e as Error).message || '加载自动化数据失败'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" py={10}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box>
      <PageHeader
        title="流程自动化"
        subtitle="事故管理（创建 / 跟踪 / 复盘）+ CI/CD 状态"
      />

      {error && (
        <MuiAlert severity="error" sx={{ mb: 2 }}>
          {error}
        </MuiAlert>
      )}

      <Grid container spacing={2}>
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                <BugReport sx={{ color: theme.palette.primary.main }} />
                <Typography variant="subtitle1">事故管理</Typography>
              </Stack>
              <Divider sx={{ mb: 1.5 }} />
              {incidents.length === 0 ? (
                <EmptyState text="暂无事故" icon={<BugReport />} />
              ) : (
                <Stack spacing={1.5}>
                  {incidents.map((inc) => (
                    <Box
                      key={inc.id}
                      sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 2 }}
                    >
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {inc.title}
                        </Typography>
                        <Stack direction="row" spacing={0.5}>
                          <StatusBadge status={levelStatus(inc.level as AlertLevel)} label={inc.level} />
                          <StatusBadge status={incidentStatus(inc.state)} label={STATE_LABEL[inc.state]} />
                        </Stack>
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {inc.assignee ? `负责人：${inc.assignee} · ` : ''}
                        更新：{new Date(inc.updatedAt).toLocaleString()}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={5}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                <AccountTree sx={{ color: theme.palette.primary.main }} />
                <Typography variant="subtitle1">CI/CD 流水线</Typography>
              </Stack>
              <Divider sx={{ mb: 1.5 }} />
              {cicd.length === 0 ? (
                <EmptyState text="暂无流水线数据" icon={<AccountTree />} />
              ) : (
                <Stack spacing={1.5}>
                  {cicd.map((p) => (
                    <Box
                      key={p.id}
                      sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 2 }}
                    >
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {p.name}
                        </Typography>
                        <StatusBadge status={cicdStatus(p.status)} label={p.status} />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        阶段：{p.stage}
                        {p.lastRunAt
                          ? ` · ${new Date(p.lastRunAt).toLocaleString()}`
                          : ''}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}
