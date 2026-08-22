import { useEffect, useState } from 'react'
import {
  Box,
  Typography,
  Stack,
  Card,
  CardContent,
  Paper,
  Divider,
  CircularProgress,
  Chip,
  TextField,
  Button,
  Alert as MuiAlert,
  useTheme,
  type Theme,
} from '@mui/material'
import {
  ShieldOutlined,
  CheckCircle,
  Error as ErrorIcon,
  Warning,
  PlayArrow,
  DeleteSweep,
  Favorite,
  Sync,
  ListAlt,
  Timer,
  History as HistoryIcon,
} from '@mui/icons-material'
import { api } from '../../capabilities/bus'
import type { GuardrailResult, GuardrailRun, DoloresRun, DoloresTool } from '@shared/types'
import PageHeader from '../components/PageHeader'

const TOOL_META: { tool: DoloresTool; label: string; icon: React.ReactNode; desc: string }[] = [
  { tool: 'health', label: '健康检查', icon: <Favorite />, desc: '进程 / 内存 / 负载 / 数据目录' },
  { tool: 'memory-sync', label: '内存同步', icon: <Sync />, desc: '持久化快照到磁盘' },
  { tool: 'dir-clean', label: '目录清理', icon: <DeleteSweep />, desc: '清理平台临时文件' },
  { tool: 'log', label: '日志查看', icon: <ListAlt />, desc: '最近活动日志与告警' },
  { tool: 'cron', label: '定时任务', icon: <Timer />, desc: '巡检 Cron 与后台引擎' },
]

const CATEGORY_LABEL: Record<string, string> = {
  'dangerous-cmd': '危险命令',
  desensitize: '敏感信息',
  'cross-device': '设备登记',
  approval: '生产审批',
}

function riskColor(risk: string, theme: Theme): string {
  if (risk === 'high') return theme.palette.error.main
  if (risk === 'medium') return theme.palette.warning.main
  return theme.palette.success.main
}

export default function OpsTools() {
  const theme = useTheme()
  const [scope, setScope] = useState('test')
  const [target, setTarget] = useState('')
  const [content, setContent] = useState('')
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<GuardrailResult | null>(null)
  const [history, setHistory] = useState<GuardrailRun[]>([])
  const [runningTool, setRunningTool] = useState<DoloresTool | null>(null)
  const [doloresLog, setDoloresLog] = useState<string[]>([])
  const [doloresHistory, setDoloresHistory] = useState<DoloresRun[]>([])
  const [error, setError] = useState('')

  const loadHistory = () => {
    api.guardrails
      .history()
      .then(setHistory)
      .catch(() => setHistory([]))
    api.dolores
      .history()
      .then(setDoloresHistory)
      .catch(() => setDoloresHistory([]))
  }
  useEffect(loadHistory, [])

  const runCheck = async () => {
    setChecking(true)
    setError('')
    try {
      const r = await api.guardrails.check(scope || 'default', target, content)
      setResult(r)
      loadHistory()
    } catch (e) {
      setError((e as Error).message || '检查失败')
    } finally {
      setChecking(false)
    }
  }

  const runTool = async (tool: DoloresTool) => {
    setRunningTool(tool)
    setDoloresLog([])
    setError('')
    try {
      const r = await api.dolores.run(tool)
      setDoloresLog(r.logs)
      loadHistory()
    } catch (e) {
      setError((e as Error).message || '执行失败')
    } finally {
      setRunningTool(null)
    }
  }

  return (
    <Box>
      <PageHeader
        title="运维工具箱"
        subtitle="发布/变更防呆检查（Guardrails）+ 平台日常运维工具（Dolores）"
      />

      {error && (
        <MuiAlert severity="error" sx={{ mb: 2 }}>
          {error}
        </MuiAlert>
      )}

      {/* —— Guardrails 防呆检查 —— */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
            <ShieldOutlined sx={{ color: theme.palette.primary.main }} />
            <Typography variant="subtitle1">发布 / 变更防呆检查</Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            真实规则引擎：危险命令检测、敏感信息明文扫描、目标设备登记校验、生产环境审批判定。任一不通过即拦截。
          </Typography>
          <Divider sx={{ my: 1.5 }} />

          <Stack spacing={1.5}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
              <TextField
                label="变更范围 (scope)"
                size="small"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                sx={{ width: 180 }}
                placeholder="test / prod"
              />
              <TextField
                label="目标设备 (target)"
                size="small"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                sx={{ width: 220 }}
                placeholder="web-01 / 10.0.1.11"
              />
            </Stack>
            <TextField
              label="命令 / 内容（危险命令与敏感信息检测）"
              size="small"
              multiline
              minRows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="例如：rm -rf /var/lib/mysql 或 kubectl delete ns prod --force"
            />
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Button
                variant="contained"
                startIcon={checking ? <CircularProgress size={16} color="inherit" /> : <PlayArrow />}
                onClick={runCheck}
                disabled={checking}
              >
                {checking ? '检查中…' : '开始检查'}
              </Button>
              {result && (
                <Chip
                  icon={result.passed ? <CheckCircle /> : <ErrorIcon />}
                  label={result.passed ? '全部通过' : `${result.riskItems} 项未通过`}
                  color={result.passed ? 'success' : 'error'}
                  variant="outlined"
                />
              )}
            </Stack>
          </Stack>

          {result && (
            <Stack spacing={1} mt={2}>
              {result.checks.map((c) => (
                <Paper
                  key={c.id}
                  variant="outlined"
                  sx={{
                    p: 1.5,
                    borderColor: c.passed ? 'divider' : riskColor(c.risk, theme),
                    bgcolor: 'action.hover',
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="center">
                    {c.passed ? (
                      <CheckCircle fontSize="small" sx={{ color: theme.palette.success.main }} />
                    ) : (
                      <Warning fontSize="small" sx={{ color: riskColor(c.risk, theme) }} />
                    )}
                    <Chip
                      size="small"
                      label={CATEGORY_LABEL[c.category] || c.category}
                      variant="outlined"
                    />
                    <Typography variant="body2" flex={1}>
                      {c.message}
                    </Typography>
                    <Typography variant="caption" sx={{ color: riskColor(c.risk, theme) }}>
                      风险：{c.risk === 'high' ? '高' : c.risk === 'medium' ? '中' : '低'}
                    </Typography>
                  </Stack>
                </Paper>
              ))}
              <Typography variant="caption" color="text.secondary">
                检查时间：{new Date(result.checkedAt).toLocaleString()}
              </Typography>
            </Stack>
          )}
        </CardContent>
      </Card>

      {/* —— Dolores 工具箱 —— */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
            <DeleteSweep sx={{ color: theme.palette.primary.main }} />
            <Typography variant="subtitle1">平台日常运维工具</Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            真实本地操作：进程健康、内存快照持久化、临时文件清理、活动日志、定时任务状态。
          </Typography>
          <Divider sx={{ my: 1.5 }} />

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap mb={2}>
            {TOOL_META.map((t) => (
              <Button
                key={t.tool}
                variant={runningTool === t.tool ? 'contained' : 'outlined'}
                startIcon={
                  runningTool === t.tool ? (
                    <CircularProgress size={16} color="inherit" />
                  ) : (
                    t.icon
                  )
                }
                disabled={runningTool !== null}
                onClick={() => runTool(t.tool)}
              >
                {t.label}
              </Button>
            ))}
          </Stack>

          {doloresLog.length > 0 && (
            <Paper
              variant="outlined"
              sx={{
                p: 1.5,
                bgcolor: theme.palette.mode === 'dark' ? '#0B0E14' : 'grey.100',
                maxHeight: 320,
                overflow: 'auto',
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  color: theme.palette.mode === 'dark' ? '#9AA7C7' : 'text.secondary',
                  fontFamily: 'monospace',
                }}
                component="pre"
                whiteSpace="pre-wrap"
              >
                {doloresLog.join('\n')}
              </Typography>
            </Paper>
          )}
        </CardContent>
      </Card>

      {/* —— 历史记录 —— */}
      <Card>
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" mb={1}>
            <HistoryIcon sx={{ color: theme.palette.primary.main }} />
            <Typography variant="subtitle1">历史记录</Typography>
          </Stack>
          <Divider sx={{ mb: 1.5 }} />
          {doloresHistory.length === 0 && history.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              暂无记录，先执行一次检查或工具。
            </Typography>
          ) : (
            <Stack spacing={1}>
              {doloresHistory.slice(0, 8).map((r) => (
                <Paper key={r.id} variant="outlined" sx={{ p: 1 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip
                      size="small"
                      label={TOOL_META.find((t) => t.tool === r.tool)?.label || r.tool}
                      variant="outlined"
                    />
                    <Chip
                      size="small"
                      label={r.status}
                      color={r.status === 'ok' ? 'success' : r.status === 'error' ? 'error' : 'default'}
                    />
                    <Typography variant="caption" color="text.secondary">
                      {new Date(r.executedAt).toLocaleString()}
                    </Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary" component="div" noWrap sx={{ mt: 0.5 }}>
                    {r.logs[0] || ''}
                  </Typography>
                </Paper>
              ))}
              {history.slice(0, 8).map((r) => (
                <Paper key={r.id} variant="outlined" sx={{ p: 1 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip size="small" label="防呆检查" color="primary" variant="outlined" />
                    <Chip
                      size="small"
                      label={r.passed ? '通过' : `${r.riskItems} 项拦截`}
                      color={r.passed ? 'success' : 'error'}
                    />
                    <Typography variant="caption" color="text.secondary">
                      范围：{r.scope} · 目标：{r.target || '—'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(r.checkedAt).toLocaleString()}
                    </Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary" component="div" noWrap sx={{ mt: 0.5 }}>
                    {r.checks[0]?.message || ''}
                  </Typography>
                </Paper>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>
    </Box>
  )
}