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

  /** 自动发现本机：用 os 信息造一个本地资产（已存在则更新） */
  discover(): Asset[] {
    const now = new Date().toISOString()
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
    const existing = memoryStore.getAssets().find((a) => a.id === local.id)
    if (!existing) memoryStore.addAsset(local)
    else memoryStore.updateAsset(local.id, local)
    return memoryStore.getAssets()
  },
}
