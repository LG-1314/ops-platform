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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
  Tabs,
  Tab,
} from '@mui/material'
import { Search, ArticleOutlined, Add as IconAdd, Delete as IconDelete, LibraryBooks, Edit as IconEdit } from '@mui/icons-material'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { api } from '../../capabilities/bus'
import type { KnowledgeHit } from '@shared/types'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import KnowledgeContent, { AssetChips } from '../components/KnowledgeContent'
import ConfirmDialog from '../components/ConfirmDialog'

/** 把检索词拆成高亮关键词（去空、去重、取最长前 8 个） */
function splitKeywords(q: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const w of q.trim().split(/[\s,，;；]+/).filter(Boolean)) {
    if (!seen.has(w) && out.length < 8) {
      seen.add(w)
      out.push(w)
    }
  }
  return out
}

/** 所有知识条目的去重标签（分类筛选用） */
function collectTags(hits: KnowledgeHit[]): string[] {
  const set = new Set<string>()
  for (const h of hits) for (const t of h.tags || []) set.add(t)
  return [...set].sort()
}

export default function Knowledge() {
  const theme = useTheme()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [q, setQ] = useState(() => searchParams.get('q') ?? '')
  const [hits, setHits] = useState<KnowledgeHit[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState('')

  // 自维护知识库
  const [tab, setTab] = useState<'search' | 'library'>('search')
  const [library, setLibrary] = useState<KnowledgeHit[]>([])
  const [libLoading, setLibLoading] = useState(false)
  const [libError, setLibError] = useState('')
  // 分类筛选（知识库 tab）
  const [tagFilter, setTagFilter] = useState('')

  // 新增知识表单
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ title: '', content: '', tags: '' })
  const [saving, setSaving] = useState(false)
  // 删除确认（此前单击删除图标立即执行，与其他页面不一致）
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)

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

  const loadLibrary = async () => {
    setLibLoading(true)
    setLibError('')
    try {
      const r = await api.knowledge.list()
      setLibrary(r)
    } catch (e) {
      setLibError((e as Error).message || '加载知识库失败')
    } finally {
      setLibLoading(false)
    }
  }

  // 详情弹层
  const [detail, setDetail] = useState<KnowledgeHit | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const openDetail = async (hit: KnowledgeHit) => {
    // 内置/检索结果：优先实时拉详情（内置 id 形如 kb-xxx，可被 getById 命中）
    if (hit.id.startsWith('kb-') || hit.id.startsWith('hit-')) {
      setDetailLoading(true)
      setDetail(hit)
      try {
        const real = await api.knowledge.get(hit.id.replace(/^hit-\d+-/, ''))
        if (real) setDetail(real)
      } catch {
        /* 拉取失败则用卡片已有内容兜底 */
      } finally {
        setDetailLoading(false)
      }
    } else {
      setDetail(hit)
    }
  }

  const closeDetail = () => setDetail(null)

  // 从顶栏全局搜索跳转而来（/knowledge?q=xxx）时，同步输入框/高亮词并自动检索。
  // 此前只检索不同步 q，已在本页时顶栏再搜会"结果更新但输入框和高亮仍是旧词"。
  useEffect(() => {
    const initial = searchParams.get('q')
    if (initial && initial.trim()) {
      setQ(initial)
      search(initial)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  useEffect(() => {
    if (tab === 'library') void loadLibrary()
  }, [tab])

  const openAdd = () => {
    setEditId(null)
    setForm({ title: '', content: '', tags: '' })
    setOpen(true)
  }

  const onSubmit = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      setLibError('标题与内容为必填')
      return
    }
    setSaving(true)
    setLibError('')
    try {
      const payload = {
        title: form.title.trim(),
        content: form.content.trim(),
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        source: 'remote',
      }
      if (editId) await api.knowledge.update(editId, payload)
      else await api.knowledge.create(payload)
      setOpen(false)
      setForm({ title: '', content: '', tags: '' })
      await loadLibrary()
    } catch (e) {
      setLibError((e as Error).message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const onRemove = async (id: string) => {
    setConfirmRemoveId(null)
    setLibError('')
    try {
      await api.knowledge.remove(id)
      await loadLibrary()
    } catch (e) {
      setLibError((e as Error).message || '删除失败')
    }
  }

  return (
    <Box>
      <PageHeader
        title="知识检索"
        subtitle="输入现象或报错关键词，检索运维 FAQ 知识库；亦可在「知识库」页维护自建知识"
      />

      <Tabs
        value={tab}
        onChange={(_e, v: 'search' | 'library') => setTab(v)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label="检索" value="search" icon={<Search fontSize="small" />} iconPosition="start" />
        <Tab label="知识库" value="library" icon={<LibraryBooks fontSize="small" />} iconPosition="start" />
      </Tabs>

      {error && (
        <MuiAlert severity="error" sx={{ mb: 2 }}>
          {error}
        </MuiAlert>
      )}

      {tab === 'search' ? (
        <>
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
            {hits.map((h) => {
              const hl = splitKeywords(q)
              return (
                <Card
                  key={h.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openDetail(h)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openDetail(h)}
                  sx={{
                    cursor: 'pointer',
                    transition: 'border-color .15s, box-shadow .15s',
                    '&:hover': { borderColor: theme.palette.primary.main, boxShadow: 1 },
                    '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}` },
                  }}
                >
                  <CardContent>
                    <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                      <ArticleOutlined sx={{ color: theme.palette.primary.main }} />
                      <Typography variant="subtitle1">{h.title}</Typography>
                      <Box sx={{ flexGrow: 1 }} />
                      <Chip size="small" label={h.source} variant="outlined" />
                    </Stack>
                    <Box sx={{ maxHeight: 80, overflow: 'hidden', position: 'relative' }}>
                      <KnowledgeContent content={h.content} highlight={hl} dense />
                    </Box>
                    {h.tags.length > 0 && (
                      <Stack direction="row" spacing={0.5} mt={1}>
                        {h.tags.map((t) => (
                          <Chip key={t} size="small" label={t} variant="outlined" />
                        ))}
                      </Stack>
                    )}
                    <AssetChips assets={h.relatedAssets} onNavigate={(a) => navigate(`/assets?q=${encodeURIComponent(a)}`)} />
                  </CardContent>
                </Card>
              )
            })}
          </Stack>
        </>
      ) : (
        <>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="body2" color="text.secondary">
              自维护知识库 + 内置 FAQ（{library.length} 条，持久化保存，随平台重启不丢失）
            </Typography>
            <Button
              variant="contained"
              startIcon={<IconAdd />}
              onClick={openAdd}
            >
              新增知识
            </Button>
          </Stack>

          {/* 分类筛选 */}
          {collectTags(library).length > 0 && (
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
              <Chip
                size="small"
                label="全部"
                color={tagFilter === '' ? 'primary' : 'default'}
                variant={tagFilter === '' ? 'filled' : 'outlined'}
                onClick={() => setTagFilter('')}
                clickable
              />
              {collectTags(library).map((t) => (
                <Chip
                  key={t}
                  size="small"
                  label={t}
                  color={tagFilter === t ? 'primary' : 'default'}
                  variant={tagFilter === t ? 'filled' : 'outlined'}
                  onClick={() => setTagFilter(tagFilter === t ? '' : t)}
                  clickable
                />
              ))}
            </Stack>
          )}

          {libError && (
            <MuiAlert severity="error" sx={{ mb: 2 }}>
              {libError}
            </MuiAlert>
          )}

          {libLoading ? (
            <Box display="flex" justifyContent="center" py={6}>
              <CircularProgress />
            </Box>
          ) : library.length === 0 ? (
            <Card>
              <CardContent>
                <EmptyState text="暂无知识，点击「新增知识」录入实践沉淀" icon={<LibraryBooks />} />
              </CardContent>
            </Card>
          ) : (
            <Stack spacing={2}>
              {library
                .filter((k) => !tagFilter || (k.tags || []).includes(tagFilter))
                .map((k) => (
                <Card
                  key={k.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openDetail(k)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openDetail(k)}
                  sx={{
                    cursor: 'pointer',
                    transition: 'border-color .15s, box-shadow .15s',
                    '&:hover': { borderColor: theme.palette.primary.main, boxShadow: 1 },
                    '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}` },
                  }}
                >
                  <CardContent>
                    <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                      <LibraryBooks sx={{ color: theme.palette.primary.main }} />
                      <Typography variant="subtitle1">{k.title}</Typography>
                      <Box sx={{ flexGrow: 1 }} />
                      <Chip size="small" label={k.source} variant="outlined" />
                      {!k.id.startsWith('kb-') && (
                        <Tooltip title="删除该知识">
                          <IconButton size="small" color="error" onClick={() => setConfirmRemoveId(k.id)}>
                            <IconDelete fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Stack>
                    <Box sx={{ maxHeight: 64, overflow: 'hidden', position: 'relative' }}>
                      <KnowledgeContent content={k.content} dense />
                    </Box>
                    {k.tags.length > 0 && (
                      <Stack direction="row" spacing={0.5} mt={1}>
                        {k.tags.map((t) => (
                          <Chip key={t} size="small" label={t} variant="outlined" />
                        ))}
                      </Stack>
                    )}
                    <AssetChips assets={k.relatedAssets} onNavigate={(a) => navigate(`/assets?q=${encodeURIComponent(a)}`)} />
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )}
        </>
      )}

      {/* 新增 / 编辑知识 */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editId ? '编辑知识' : '新增知识'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="标题"
              fullWidth
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="例如：磁盘空间不足的处理步骤"
            />
            <TextField
              label="内容"
              fullWidth
              multiline
              minRows={4}
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              placeholder="step-by-step 排查与解决过程…"
            />
            <TextField
              label="标签（逗号分隔，可选）"
              fullWidth
              value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              placeholder="磁盘,排查"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>取消</Button>
          <Button variant="contained" disabled={saving} onClick={onSubmit}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 知识详情 */}
      <Dialog open={!!detail} onClose={closeDetail} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ArticleOutlined sx={{ color: theme.palette.primary.main }} />
          {detail?.title}
        </DialogTitle>
        <DialogContent>
          {detailLoading ? (
            <Box display="flex" justifyContent="center" py={4}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <Stack spacing={1.5} sx={{ mt: 1 }}>
              <Box>
                {detail?.tags.map((t) => (
                  <Chip key={t} size="small" label={t} variant="outlined" sx={{ mr: 0.5, mb: 0.5 }} />
                ))}
              </Box>
              <KnowledgeContent content={detail?.content || ''} highlight={splitKeywords(q)} />
              <AssetChips
                assets={detail?.relatedAssets || []}
                onNavigate={(a) => { closeDetail(); navigate(`/assets?q=${encodeURIComponent(a)}`) }}
              />
              <Typography variant="caption" color="text.secondary">
                来源：{detail?.source}
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          {detail && !detail.id.startsWith('kb-') && (
            <Button
              startIcon={<IconEdit />}
              onClick={() => {
                setEditId(detail.id)
                setForm({ title: detail.title, content: detail.content, tags: (detail.tags || []).join(',') })
                setOpen(true)
                setDetail(null)
              }}
            >
              编辑
            </Button>
          )}
          <Button onClick={closeDetail}>关闭</Button>
        </DialogActions>
      </Dialog>

      {/* 删除确认 */}
      <ConfirmDialog
        open={!!confirmRemoveId}
        title="删除知识"
        content="确定删除这条自维护知识吗？删除后不可恢复。"
        onConfirm={() => confirmRemoveId && void onRemove(confirmRemoveId)}
        onClose={() => setConfirmRemoveId(null)}
      />
    </Box>
  )
}