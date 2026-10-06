import type { DbConnection, DbHealth, DbMetric, Status } from '@shared/types'
import mysql from 'mysql2/promise'
import { Pool } from 'pg'
import Redis from 'ioredis'
import { credentialService } from './credentialService'
import { logger } from '../utils/logger'

function metric(name: string, value: string, status: Status = 'ok'): DbMetric {
  return { name, value, status }
}

function nowIso(): string {
  return new Date().toISOString()
}

/**
 * 给任意异步检查加超时，避免连接挂起拖垮整个能力总线。
 * 注意：reject 只能放弃等待，不能终止底层查询 —— 各 check 内部还需
 * 自带"看门狗销毁连接"（否则挂起的 socket/连接池会每 2 分钟泄漏一个）。
 */
function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(msg)), ms)
    p.then(
      (r) => {
        clearTimeout(t)
        resolve(r)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      }
    )
  })
}

async function checkMysql(
  conn: DbConnection,
  user?: string,
  password?: string
): Promise<DbHealth> {
  const c = await mysql.createConnection({
    host: conn.host,
    port: conn.port || 3306,
    user,
    password,
    database: conn.database,
    connectTimeout: 6000,
  })
  // 看门狗：mysql2 无语句级超时，服务端若"接受连接但不应答"会永远挂起，
  // 必须在超时时强断 socket，否则每轮采集泄漏一个连接。
  const watchdog = setTimeout(() => {
    try {
      const raw = c as unknown as { connection?: { destroy: () => void } }
      raw.connection?.destroy()
    } catch {
      /* ignore */
    }
  }, 8500)
  try {
    const [v] = (await c.query('SELECT VERSION() AS v')) as unknown as [{ v: string }]
    const [stat] = (await c.query("SHOW GLOBAL STATUS LIKE 'Threads_connected'")) as unknown as [
      { Value: string }
    ]
    const [vars] = (await c.query("SHOW VARIABLES LIKE 'max_connections'")) as unknown as [
      { Value: string }
    ]
    const version = v?.v ?? ''
    const threads = Number(stat?.Value ?? 0)
    const maxConn = Number(vars?.Value ?? 0)
    const metrics: DbMetric[] = [
      metric('版本', String(version || '-')),
      metric(
        '当前连接数',
        String(threads),
        maxConn > 0 && threads > maxConn * 0.9 ? 'warn' : 'ok'
      ),
      metric('最大连接数', String(maxConn)),
    ]
    return {
      id: conn.id,
      connectionId: conn.id,
      dbType: 'mysql',
      connected: true,
      version,
      metrics,
      checkedAt: nowIso(),
    }
  } finally {
    clearTimeout(watchdog)
    await c.end().catch(() => {})
  }
}

async function checkPostgres(
  conn: DbConnection,
  user?: string,
  password?: string
): Promise<DbHealth> {
  const pool = new Pool({
    host: conn.host,
    port: conn.port || 5432,
    user,
    password,
    database: conn.database,
    connectionTimeoutMillis: 6000,
    // 语句级超时：挂起的查询会在 5s 后由服务端取消，finally 才能真正执行
    statement_timeout: 5000,
    query_timeout: 5000,
    max: 1,
  })
  try {
    const v = await pool.query('SELECT version()')
    const act = await pool.query('SELECT count(*)::int AS n FROM pg_stat_activity')
    const version = String(v.rows[0]?.version ?? '-').split(' ').slice(0, 2).join(' ')
    const conns = Number(act.rows[0]?.n ?? 0)
    return {
      id: conn.id,
      connectionId: conn.id,
      dbType: 'postgres',
      connected: true,
      version,
      metrics: [metric('版本', version), metric('活跃连接', String(conns))],
      checkedAt: nowIso(),
    }
  } finally {
    await pool.end().catch(() => {})
  }
}

async function checkRedis(conn: DbConnection, password?: string): Promise<DbHealth> {
  const r = new Redis({
    host: conn.host,
    port: conn.port || 6379,
    password: password || undefined,
    connectTimeout: 6000,
    commandTimeout: 5000,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  })
  try {
    await r.connect()
    const ping = await r.ping()
    const info = await r.info('server')
    const mem = await r.info('memory')
    const ver = info.match(/redis_version:(.+)/)?.[1]?.trim()
    const usedMem = mem.match(/used_memory_human:(.+)/)?.[1]?.trim()
    return {
      id: conn.id,
      connectionId: conn.id,
      dbType: 'redis',
      connected: true,
      version: ver ?? undefined,
      metrics: [
        metric('PING', String(ping)),
        metric('版本', ver ?? '-'),
        metric('内存占用', usedMem ?? '-'),
      ],
      checkedAt: nowIso(),
    }
  } finally {
    r.disconnect()
  }
}

/** 把底层驱动错误映射为面向用户的简洁文案；完整错误只进服务端日志。 */
function sanitizeDbError(e: unknown): string {
  const raw = e instanceof Error ? `${e.message}` : String(e)
  logger.error(`[db] 健康检查失败：${raw}`)
  if (e instanceof Error && e.name === 'AbortError') return '检查超时'
  if (/timeout|timed out|ETIMEDOUT/i.test(raw)) return '连接超时：目标未在时限内响应'
  if (/ECONNREFUSED/i.test(raw)) return '连接被拒绝：端口未监听或防火墙拦截'
  if (/ENOTFOUND|EAI_AGAIN/i.test(raw)) return '域名解析失败'
  if (/access denied|authentication|密码|auth/i.test(raw)) return '认证失败：用户名或密码错误'
  if (/certificate|ssl|tls/i.test(raw)) return 'TLS/证书校验失败'
  return '无法连接到数据库'
}

export async function checkHealth(conn: DbConnection): Promise<DbHealth> {
  const secret = conn.credentialId ? credentialService.decrypt(conn.credentialId) : undefined
  const user = conn.username || secret?.username
  const password = secret?.password
  try {
    if (conn.dbType === 'mysql')
      return await withTimeout(checkMysql(conn, user, password), 9000, 'MySQL 检查超时')
    if (conn.dbType === 'postgres')
      return await withTimeout(checkPostgres(conn, user, password), 9000, 'PostgreSQL 检查超时')
    if (conn.dbType === 'redis')
      return await withTimeout(checkRedis(conn, password), 9000, 'Redis 检查超时')
    return {
      id: conn.id,
      connectionId: conn.id,
      dbType: conn.dbType,
      connected: false,
      metrics: [],
      checkedAt: nowIso(),
      error: '未知数据库类型',
    }
  } catch (e) {
    // mysql2/pg 的错误消息可能携带主机、端口与 SQL 片段，不直接透传给渲染端
    return {
      id: conn.id,
      connectionId: conn.id,
      dbType: conn.dbType,
      connected: false,
      metrics: [metric('错误', sanitizeDbError(e), 'error')],
      checkedAt: nowIso(),
      error: sanitizeDbError(e),
    }
  }
}
