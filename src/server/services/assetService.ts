import os from 'node:os'
import { hostname } from 'node:os'
import { memoryStore } from '../store/memoryStore'
import type { Asset, AssetType, AssetSource } from '@shared/types'

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export const assetService = {
  /** 资产台账：支持按名称/标签/主机模糊检索与类型过滤 */
  list(q?: string, type?: AssetType): Asset[] {
    let list = memoryStore.getAssets()
    if (q) {
      const s = q.toLowerCase()
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(s) ||
          a.host.toLowerCase().includes(s) ||
          a.tags.some((t) => t.toLowerCase().includes(s))
      )
    }
    if (type) list = list.filter((a) => a.type === type)
    return list
  },

  get(id: string): Asset | undefined {
    return memoryStore.getAssets().find((a) => a.id === id)
  },

  create(partial: Partial<Asset>): Asset {
    const now = new Date().toISOString()
    const asset: Asset = {
      id: partial.id || genId('asset'),
      name: partial.name || '未命名资产',
      type: (partial.type as AssetType) || 'server',
      host: partial.host || 'unknown',
      ip: partial.ip,
      port: partial.port,
      source: (partial.source as AssetSource) || 'manual',
      tags: partial.tags || [],
      credentialId: partial.credentialId,
      createdAt: now,
      healthScore: partial.healthScore ?? 100,
      status: partial.status || 'ok',
      lastScanAt: partial.lastScanAt,
    }
    return memoryStore.addAsset(asset)
  },

  update(id: string, partial: Partial<Asset>): Asset | undefined {
    return memoryStore.updateAsset(id, partial)
  },

  remove(id: string): boolean {
    return memoryStore.removeAsset(id)
  },

  /** 自动发现本机：用 os 信息造一个本地资产（已存在则仅补充缺失字段，不覆盖监控结果）。 */
  discover(): Asset[] {
    const now = new Date().toISOString()
    const existing = memoryStore.getAssets().find((a) => a.id === 'asset-localhost')
    if (!existing) {
      const local: Asset = {
        id: 'asset-localhost',
        name: `本机 (${hostname()})`,
        type: 'server',
        host: hostname(),
        ip: '127.0.0.1',
        source: 'auto',
        tags: ['local', os.platform(), os.arch()],
        createdAt: now,
        healthScore: 92,
        status: 'ok',
        lastScanAt: now,
      }
      memoryStore.addAsset(local)
    } else {
      // 仅补标签等静态信息，绝不回写 healthScore/status（那是由 monitorService 实时算出的），
      // 也保留已关联的 credentialId，避免 SSH 指标采集因 discover 而失效。
      const tags = Array.from(new Set([...(existing.tags || []), 'local', os.platform(), os.arch()]))
      memoryStore.updateAsset('asset-localhost', { tags })
    }
    return memoryStore.getAssets()
  },
}
