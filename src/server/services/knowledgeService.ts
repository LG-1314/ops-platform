import { searchKnowledge } from '@diagnostics/knowledge.mjs'
import type { KnowledgeHit } from '@shared/types'

interface FaqItem {
  q: string
  a: string
  tags: string[]
}

// 自维护知识（P2 占位：POST /knowledge 写入，GET /knowledge/:id 读取）
const localKnowledge: KnowledgeHit[] = []

function toHit(raw: FaqItem, idx: number): KnowledgeHit {
  const tags = raw.tags ?? []
  return {
    id: `kb-${idx}`,
    title: raw.q.split(' ')[0] || raw.q,
    content: raw.a,
    source: 'builtin-faq',
    tags,
    relatedAssets: [],
  }
}

export const knowledgeService = {
  /** 内置 FAQ 检索（复用 knowledge.mjs） */
  search(q: string): KnowledgeHit[] {
    const list = searchKnowledge(q) as unknown as FaqItem[]
    return list.map(toHit)
  },

  /** 自维护知识列表（P2 占位） */
  listLocal(): KnowledgeHit[] {
    return localKnowledge
  },

  getById(id: string): KnowledgeHit | undefined {
    return localKnowledge.find((k) => k.id === id)
  },

  create(partial: Partial<KnowledgeHit>): KnowledgeHit {
    const hit: KnowledgeHit = {
      id: partial.id || `kb-${Date.now().toString(36)}`,
      title: partial.title || '未命名',
      content: partial.content || '',
      source: partial.source || 'remote',
      tags: partial.tags || [],
      relatedAssets: partial.relatedAssets || [],
    }
    localKnowledge.push(hit)
    return hit
  },
}
