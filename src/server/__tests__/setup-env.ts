// 测试环境隔离：在一切其它模块导入之前执行。
// ESM 静态导入按声明顺序执行，本文件必须位于测试入口的第一行 import。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-test-'))
process.env.OPS_DATA_DIR = tmp
