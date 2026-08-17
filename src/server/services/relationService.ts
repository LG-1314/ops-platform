import { relatedProjects } from '@diagnostics/knowledge.mjs'
import type { RelatedProject } from '@shared/types'

export const relationService = {
  /** 单个资产的关联项目（复用 knowledge.mjs） */
  of(asset: string): RelatedProject[] {
    return relatedProjects(asset) as unknown as RelatedProject[]
  },

  /** 全部关联项目 */
  all(): RelatedProject[] {
    return relatedProjects('') as unknown as RelatedProject[]
  },
}
