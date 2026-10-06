import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { logger } from '../utils/logger'

// 持久化：把整个 Store 以 JSON 原子落盘到本机用户目录。
// 不用 better-sqlite3 等原生模块 —— 纯 JS 实现零编译，杜绝 Electron 打包后原生模块
// 重编译失败导致的白屏/启动崩溃（用户首要诉求是「百分百能运行」）。
//
// 可靠性设计（防止一次磁盘故障毁掉全部数据）：
// 1. 主文件损坏 → 自动尝试上一代备份 *.bak；
// 2. 仍损坏 → 把坏文件隔离为 *.corrupt-<ts>（绝不删除，供人工抢救）；
// 3. 写入失败（Windows 上常见于杀软/索引器锁文件）→ 保留待写数据，指数退避重试；
// 4. 全部敏感数据文件以 0600 权限落盘，rename 前强制 fsync。
const FILE = 'store.json'
const FILE_MODE = 0o600
const MAX_WRITE_RETRIES = 5

function dataDir(): string {
  const d = process.env.OPS_DATA_DIR || path.join(os.homedir(), '.ops-platform')
  try {
    fs.mkdirSync(d, { recursive: true })
  } catch {
    /* ignore */
  }
  return d
}

function fileOf(filename: string): string {
  return path.join(dataDir(), filename)
}

/**
 * 读取 JSON 文件。文件不存在返回 null；解析失败时隔离坏文件并返回 null（调用方自行决定降级策略）。
 */
function readParsed(filename: string): { value: unknown } | null {
  const p = fileOf(filename)
  if (!fs.existsSync(p)) return null
  try {
    return { value: JSON.parse(fs.readFileSync(p, 'utf8')) }
  } catch (e) {
    // 损坏文件绝不静默丢弃：隔离改名留存，等待人工检查
    const quarantine = fileOf(`${filename}.corrupt-${Date.now()}`)
    try {
      fs.renameSync(p, quarantine)
    } catch {
      /* rename 失败则保留原状 */
    }
    logger.error(`[persist] ${filename} 解析失败，已隔离至 ${quarantine}：${e instanceof Error ? e.message : String(e)}`)
    return null
  }
}

/** 读取 dataDir 下任意 JSON 文件；不存在返回 null（不参与备份恢复链）。 */
export function readJSONFile(filename: string): unknown | null {
  const r = readParsed(filename)
  return r ? r.value : null
}

/**
 * 读取已有 store：
 * 主文件缺失/损坏时依次尝试 *.bak（上一代好备份）→ 隔离坏文件后返回 null（调用方播种）。
 */
export function loadStore(): unknown | null {
  const main = readParsed(FILE)
  if (main) {
    loadOutcome = 'ok'
    return main.value
  }
  const bak = readParsed(`${FILE}.bak`)
  if (bak) {
    logger.warn(`[persist] ${FILE} 不可用，已从备份 ${FILE}.bak 恢复`)
    loadOutcome = 'recovered-from-backup'
    return bak.value
  }
  // 主文件与备份都不可用：若存在主文件/隔离文件，说明曾有数据但已无法读取
  loadOutcome = fs.existsSync(fileOf(FILE)) || fs.readdirSync(dataDir()).some((f) => f.startsWith(`${FILE}.corrupt-`))
    ? 'corrupt'
    : 'fresh'
  return null
}

/** 本次 loadStore 的结局，供上层在"带损播种"时向用户告警。 */
export type LoadOutcome = 'fresh' | 'ok' | 'recovered-from-backup' | 'corrupt'
let loadOutcome: LoadOutcome = 'fresh'
export function getLoadOutcome(): LoadOutcome {
  return loadOutcome
}

/** 原子写 JSON：写 .tmp → fsync → rename。返回是否成功（失败时调用方应保留待写数据）。 */
export function writeJSONAtomic(filename: string, data: unknown): boolean {
  const p = fileOf(filename)
  const tmp = fileOf(`${filename}.tmp`)
  try {
    const json = JSON.stringify(data, null, 2)
    const fh = fs.openSync(tmp, 'w', FILE_MODE)
    try {
      fs.writeFileSync(fh, json, 'utf8')
      fs.fsyncSync(fh)
    } finally {
      fs.closeSync(fh)
    }
    // rename 前把当前主文件留作上一代备份（best-effort）
    try {
      if (fs.existsSync(p)) fs.copyFileSync(p, fileOf(`${filename}.bak`))
    } catch {
      /* 备份失败不阻断主流程 */
    }
    fs.renameSync(tmp, p)
    return true
  } catch (e) {
    try {
      fs.rmSync(tmp, { force: true })
    } catch {
      /* ignore */
    }
    logger.error(`[persist] 保存失败 ${filename}：${e instanceof Error ? e.message : String(e)}`)
    return false
  }
}

let timer: NodeJS.Timeout | null = null
let pending: unknown = null
let retryCount = 0

/** 防抖落盘：多次写入合并为一次，避免高频监控导致频繁 IO。 */
export function schedulePersist(store: unknown): void {
  pending = store
  if (timer) return
  timer = setTimeout(() => {
    timer = null
    flush()
  }, 400)
}

/** 立即落盘（进程退出前调用，确保不丢数据）。 */
export function persistNow(store: unknown): void {
  pending = store
  retryCount = 0
  flush()
}

function flush(): void {
  if (pending == null) return
  const okWrite = writeJSONAtomic(FILE, pending)
  if (okWrite) {
    pending = null
    retryCount = 0
    return
  }
  // 写失败（Windows 杀软/索引器锁住 store.json 是常见原因）：保留待写数据，
  // 指数退避重试，最多 5 次，避免 400ms 防抖窗口内的变更被静默丢弃。
  if (retryCount >= MAX_WRITE_RETRIES) {
    logger.error(`[persist] 连续 ${retryCount + 1} 次保存失败，放弃本批变更（数据仍在内存中，下次变更会再次尝试落盘）`)
    pending = null
    retryCount = 0
    return
  }
  const delay = 400 * 2 ** retryCount
  retryCount += 1
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    flush()
  }, delay)
}
