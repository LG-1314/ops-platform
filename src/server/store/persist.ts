import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// 持久化：把整个 Store 以 JSON 原子落盘到本机用户目录。
// 不用 better-sqlite3 等原生模块 —— 纯 JS 实现零编译，杜绝 Electron 打包后原生模块
// 重编译失败导致的白屏/启动崩溃（用户首要诉求是「百分百能运行」）。
const FILE = 'store.json'
const TMP = 'store.json.tmp'

function dataDir(): string {
  const d = process.env.OPS_DATA_DIR || path.join(os.homedir(), '.ops-platform')
  try {
    fs.mkdirSync(d, { recursive: true })
  } catch {
    /* ignore */
  }
  return d
}

/** 读取已有 store；不存在或解析失败返回 null（调用方应播种）。 */
export function loadStore(): unknown | null {
  try {
    const p = path.join(dataDir(), FILE)
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8'))
    }
  } catch {
    /* ignore */
  }
  return null
}

let timer: NodeJS.Timeout | null = null
let pending: unknown = null

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
  flush()
}

function flush(): void {
  if (pending == null) return
  const p = path.join(dataDir(), FILE)
  const tmp = path.join(dataDir(), TMP)
  try {
    fs.writeFileSync(tmp, JSON.stringify(pending, null, 2))
    fs.renameSync(tmp, p) // 原子替换，避免半写文件
    pending = null
  } catch (e) {
    // 落盘失败不致命：内存态仍可用，仅重启后丢失
    try {
      // eslint-disable-next-line no-console
      console.error('[persist] 保存失败', e)
    } catch {
      /* ignore */
    }
  }
}
