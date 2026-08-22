import { searchKnowledge, getBuiltinById, listBuiltin, relatedAssetsFor } from '@diagnostics/knowledge.mjs'
import { memoryStore } from '../store/memoryStore'
import type { KnowledgeHit } from '@shared/types'

function genId(): string {
  return `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

/** 内置 FAQ → KnowledgeHit（稳定 id 来自知识库，便于详情接口命中） */
function builtinToHit(raw: {
  id: string
  title: string
  keywords: string[]
  tags: string[]
  a: string
}): KnowledgeHit {
  return {
    id: raw.id,
    title: raw.title,
    content: raw.a,
    source: 'builtin-faq',
    tags: raw.tags,
    relatedAssets: relatedAssetsFor(raw.id),
  }
}

/** 检索结果 → KnowledgeHit（运行期生成 id，详情接口用 /knowledge/search 即时获取，不依赖持久化 id） */
function searchToHit(raw: {
  id: string
  title: string
  keywords: string[]
  tags: string[]
  a: string
}, idx: number): KnowledgeHit {
  return {
    id: `hit-${idx}-${raw.id}`,
    title: raw.title,
    content: raw.a,
    source: 'builtin-faq',
    tags: raw.tags,
    relatedAssets: relatedAssetsFor(raw.id),
  }
}

export const knowledgeService = {
  /** 内置 FAQ 检索 + 自维护知识合并检索（让用户录入的知识同样可被检索命中） */
  search(q: string): KnowledgeHit[] {
    const kw = (q || '').trim().toLowerCase()
    if (!kw) return []
    const builtin = searchKnowledge(q) as unknown as Parameters<typeof searchToHit>[0][]
    const builtinHits = builtin.map((f, i) => searchToHit(f, i))
    // 自维护知识：按标题 / 内容 / 标签模糊匹配（与内置条目一起按相关度参与排序）
    const userHits = memoryStore
      .getKnowledge()
      .filter((k) => {
        const hay = `${k.title} ${k.content} ${(k.tags || []).join(' ')} ${k.source}`.toLowerCase()
        // 关键词命中：整词包含即可（英文按空格分词，中文按整串包含）
        return kw.split(/[\s,，;；]+/).filter(Boolean).some((w) => hay.includes(w))
      })
    // 排序：标题命中优先 > 标签命中 > 内容命中，保证最相关条目在前
    const rank = (k: KnowledgeHit): number => {
      const t = k.title.toLowerCase()
      const c = k.content.toLowerCase()
      const tag = (k.tags || []).join(' ').toLowerCase()
      const hit = kw.split(/[\s,，;；]+/).filter(Boolean)
      let score = 0
      for (const w of hit) {
        if (t.includes(w)) score += 3
        if (tag.includes(w)) score += 2
        if (c.includes(w)) score += 1
      }
      return score
    }
    return [...userHits.sort((a, b) => rank(b) - rank(a)), ...builtinHits]
  },

  /** 自维护 + 内置 FAQ 合并列表（让「知识库」页开箱即丰富，内置条目不可删） */
  listLocal(): KnowledgeHit[] {
    const builtin = (listBuiltin() as unknown as Parameters<typeof builtinToHit>[0][]).map(builtinToHit)
    const user = memoryStore.getKnowledge()
    return [...builtin, ...user]
  },

  /** 详情：先查自维护知识，再回退内置 FAQ（解决内置条目详情 404 死链） */
  getById(id: string): KnowledgeHit | undefined {
    const userHit = memoryStore.getKnowledge().find((k) => k.id === id)
    if (userHit) return userHit
    const builtin = getBuiltinById(id) as unknown as Parameters<typeof builtinToHit>[0] | null
    return builtin ? builtinToHit(builtin) : undefined
  },

  create(partial: Partial<KnowledgeHit>): KnowledgeHit {
    const hit: KnowledgeHit = {
      id: partial.id || genId(),
      title: partial.title || '未命名',
      content: partial.content || '',
      source: partial.source || 'remote',
      tags: partial.tags || [],
      relatedAssets: partial.relatedAssets || [],
    }
    return memoryStore.addKnowledge(hit)
  },

  update(id: string, partial: Partial<KnowledgeHit>): KnowledgeHit | undefined {
    return memoryStore.updateKnowledge(id, partial)
  },

  remove(id: string): boolean {
    // 内置 FAQ 不允许删除（id 形如 kb-xxx）
    if (id.startsWith('kb-')) return false
    return memoryStore.removeKnowledge(id)
  },
}
