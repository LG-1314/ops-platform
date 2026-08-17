import { useEffect, useState } from 'react'
import {
  Box,
  Typography,
  Stack,
  TextField,
  Button,
  Card,
  CardContent,
  Chip,
  InputAdornment,
  CircularProgress,
  Alert as MuiAlert,
  useTheme,
} from '@mui/material'
import { Search, ArticleOutlined } from '@mui/icons-material'
import { useSearchParams } from 'react-router-dom'
import { api } from '../../capabilities/bus'
import type { KnowledgeHit } from '@shared/types'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'

export default function Knowledge() {
  const theme = useTheme()
  const [searchParams] = useSearchParams()
  const [q, setQ] = useState(() => searchParams.get('q') ?? '')
  const [hits, setHits] = useState<KnowledgeHit[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState('')

  const search = async (query?: string) => {
    const keyword = (query ?? q).trim()
    if (!keyword) return
    setLoading(true)
    setError('')
    try {
      const r = await api.knowledge.search(keyword)
      setHits(r)
      setSearched(true)
    } catch (e) {
      setError((e as Error).message || '检索失败')
    } finally {
      setLoading(false)
    }
  }

  // 从顶栏全局搜索跳转而来（/knowledge?q=xxx）时，自动预填并检索
  useEffect(() => {
    const initial = searchParams.get('q')
    if (initial && initial.trim()) {
      search(initial)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  return (
    <Box>
      <PageHeader
        title="知识检索"
        subtitle="输入现象或报错关键词，检索运维 FAQ 知识库"
      />

      <Stack direction="row" spacing={1} mb={3}>
        <TextField
          fullWidth
          size="small"
          placeholder="例如：磁盘空间不足、采集不到数据、内存泄漏…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search />
              </InputAdornment>
            ),
          }}
        />
        <Button
          variant="contained"
          onClick={() => search()}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <Search />}
        >
          检索
        </Button>
      </Stack>

      {error && (
        <MuiAlert severity="error" sx={{ mb: 2 }}>
          {error}
        </MuiAlert>
      )}

      {loading && (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress />
        </Box>
      )}

      {!loading && !searched && (
        <Card>
          <CardContent>
            <EmptyState text="输入现象级描述，立即获取可执行的排查方案" icon={<Search />} />
          </CardContent>
        </Card>
      )}

      {!loading && searched && hits.length === 0 && (
        <Card>
          <CardContent>
            <EmptyState text={`未找到与“${q}”相关的知识，可尝试更换关键词`} icon={<ArticleOutlined />} />
          </CardContent>
        </Card>
      )}

      <Stack spacing={2}>
        {hits.map((h) => (
          <Card key={h.id}>
            <CardContent>
                <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                <ArticleOutlined sx={{ color: theme.palette.primary.main }} />
                <Typography variant="subtitle1">{h.title}</Typography>
                <Box sx={{ flexGrow: 1 }} />
                <Chip size="small" label={h.source} variant="outlined" />
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
                {h.content}
              </Typography>
              {h.tags.length > 0 && (
                <Stack direction="row" spacing={0.5} mt={1}>
                  {h.tags.map((t) => (
                    <Chip key={t} size="small" label={t} variant="outlined" />
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Box>
  )
}
