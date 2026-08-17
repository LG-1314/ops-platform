import type { DbConnection, DbHealth, DbMetric, Status } from '@shared/types'
import mysql from 'mysql2/promise'
import { Pool } from 'pg'
import Redis from 'ioredis'
import { credentialService } from './credentialService'

function metric(name: string, value: string, status: Status = 'ok'): DbMetric {
  return { name, value, status }
}

function nowIso(): string {
  return new Date().toISOString()
}

/** 给任意异步检查加超时，避免连接挂起拖垮整个能力总线。 */
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
    const err = e as Error
    return {
      id: conn.id,
      connectionId: conn.id,
      dbType: conn.dbType,
      connected: false,
      metrics: [metric('错误', err.message, 'error')],
      checkedAt: nowIso(),
      error: err.message,
    }
  }
}
