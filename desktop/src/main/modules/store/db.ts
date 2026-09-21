import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  CommentEvent,
  IntentType,
  LivePlan,
  Product,
  ReplyItem,
  Script,
  SessionSummary,
  VoiceProfile
} from '@shared/ipc'
import { log } from '../../logger'

/**
 * SQLite 数据层。惰性初始化：首次调用才打开库，原生模块异常时降级，
 * 保证应用其余功能不受影响。
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price REAL DEFAULT 0,
  selling_points TEXT DEFAULT '',
  faq TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS scripts (
  id TEXT PRIMARY KEY,
  product_id TEXT,
  title TEXT NOT NULL,
  segments TEXT DEFAULT '[]',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS voices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source TEXT DEFAULT 'preset',
  voice_type TEXT DEFAULT '',
  sample_path TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  comment_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  reply_latency_total_ms INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  author TEXT,
  author_id TEXT,
  content TEXT NOT NULL,
  kind TEXT DEFAULT 'comment',
  intent TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS reply_log (
  id TEXT PRIMARY KEY,
  comment_id TEXT,
  author TEXT,
  question TEXT,
  reply_text TEXT,
  intent TEXT DEFAULT 'other',
  status TEXT DEFAULT 'pending',
  latency_ms INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS live_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  theme TEXT DEFAULT '',
  product_id TEXT,
  script_id TEXT,
  voice_id TEXT,
  bgm_path TEXT DEFAULT '',
  bgm_volume REAL DEFAULT 0.3,
  auto_reply INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`

let db: Database.Database | null = null
let failed = false

function getDb(): Database.Database | null {
  if (db || failed) return db
  try {
    db = new Database(join(app.getPath('userData'), 'ailive.db'))
    db.pragma('journal_mode = WAL')
    db.exec(SCHEMA)
  } catch (err) {
    failed = true
    log.error('SQLite 初始化失败，数据层降级:', err)
  }
  return db
}

function run<T>(fn: (d: Database.Database) => T, fallback: T): T {
  const store = getDb()
  if (!store) return fallback
  try {
    return fn(store)
  } catch (err) {
    log.error('数据库操作失败:', err)
    return fallback
  }
}

// ---------- 商品 ----------

interface ProductRow {
  id: string
  name: string
  price: number
  selling_points: string
  faq: string
  created_at: number
}

function toProduct(r: ProductRow): Product {
  return {
    id: r.id,
    name: r.name,
    price: r.price,
    sellingPoints: r.selling_points,
    faq: r.faq,
    createdAt: r.created_at
  }
}

export function listProducts(): Product[] {
  return run(
    (d) =>
      d
        .prepare('SELECT * FROM products ORDER BY created_at DESC')
        .all()
        .map((r) => toProduct(r as ProductRow)),
    []
  )
}

export function saveProduct(p: Product): void {
  run((d) => {
    d.prepare(
      `INSERT INTO products (id, name, price, selling_points, faq, created_at)
       VALUES (@id, @name, @price, @sellingPoints, @faq, @createdAt)
       ON CONFLICT(id) DO UPDATE SET
         name=@name, price=@price, selling_points=@sellingPoints, faq=@faq`
    ).run({ ...p, createdAt: p.createdAt || Date.now() })
  }, undefined)
}

export function deleteProduct(id: string): void {
  run((d) => d.prepare('DELETE FROM products WHERE id = ?').run(id), undefined)
}

/** 轻量知识库检索：中文二元词评分，并优先补入当前场次绑定商品。 */
export function searchKnowledge(query: string, limit = 3, preferredProductId?: string): Product[] {
  const products = listProducts()
  const normalized = query.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
  const terms = new Set<string>()
  for (const match of normalized.matchAll(/[a-z0-9]{2,}|[\p{Script=Han}]{2,}/gu)) {
    const value = match[0]
    if (/^[a-z0-9]+$/.test(value)) {
      terms.add(value)
      continue
    }
    for (let index = 0; index < value.length - 1; index += 1) {
      terms.add(value.slice(index, index + 2))
    }
  }

  const ranked = products
    .map((product) => {
      const haystack = `${product.name}\n${product.sellingPoints}\n${product.faq}`.toLowerCase()
      let score = normalized.includes(product.name.toLowerCase()) ? 100 : 0
      for (const term of terms) {
        if (haystack.includes(term)) score += term.length
      }
      if (product.id === preferredProductId) score += 50
      return { product, score }
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || right.product.createdAt - left.product.createdAt)

  return ranked.slice(0, limit).map(({ product }) => product)
}

// ---------- 话术 ----------

interface ScriptRow {
  id: string
  product_id: string | null
  title: string
  segments: string
  created_at: number
}

export function listScripts(): Script[] {
  return run(
    (d) =>
      d
        .prepare('SELECT * FROM scripts ORDER BY created_at DESC')
        .all()
        .map((r) => {
          const row = r as ScriptRow
          return { id: row.id, title: row.title, productId: row.product_id, segments: JSON.parse(row.segments), createdAt: row.created_at }
        }),
    []
  )
}

export function getScript(id: string): Script | null {
  return run((d) => {
    const row = d.prepare('SELECT * FROM scripts WHERE id = ?').get(id) as ScriptRow | undefined
    if (!row) return null
    return { id: row.id, title: row.title, productId: row.product_id, segments: JSON.parse(row.segments), createdAt: row.created_at }
  }, null)
}

export function saveScript(s: Script): void {
  run((d) => {
    d.prepare(
      `INSERT INTO scripts (id, product_id, title, segments, created_at)
       VALUES (@id, @productId, @title, @segments, @createdAt)
       ON CONFLICT(id) DO UPDATE SET title=@title, segments=@segments, product_id=@productId`
    ).run({ ...s, segments: JSON.stringify(s.segments) })
  }, undefined)
}

export function deleteScript(id: string): void {
  run((d) => d.prepare('DELETE FROM scripts WHERE id = ?').run(id), undefined)
}

// ---------- 音色 ----------

interface VoiceRow {
  id: string
  name: string
  source: string
  voice_type: string
  sample_path: string | null
  created_at: number
}

export function listVoices(): VoiceProfile[] {
  return run(
    (d) =>
      d
        .prepare('SELECT * FROM voices ORDER BY created_at DESC')
        .all()
        .map(
          (r) =>
            ({
              id: (r as VoiceRow).id,
              name: (r as VoiceRow).name,
              source: (r as VoiceRow).source,
              voiceType: (r as VoiceRow).voice_type,
              samplePath: (r as VoiceRow).sample_path,
              createdAt: (r as VoiceRow).created_at
            }) as VoiceProfile
        ),
    []
  )
}

export function saveVoice(v: VoiceProfile): void {
  run((d) => {
    d.prepare(
      `INSERT INTO voices (id, name, source, voice_type, sample_path, created_at)
       VALUES (@id, @name, @source, @voiceType, @samplePath, @createdAt)
       ON CONFLICT(id) DO UPDATE SET name=@name, source=@source, voice_type=@voiceType, sample_path=@samplePath`
    ).run(v)
  }, undefined)
}

export function deleteVoice(id: string): void {
  run((d) => d.prepare('DELETE FROM voices WHERE id = ?').run(id), undefined)
}

// ---------- 直播场次 ----------

interface PlanRow {
  id: string
  name: string
  theme: string
  product_id: string | null
  script_id: string | null
  voice_id: string | null
  bgm_path: string
  bgm_volume: number
  auto_reply: number
  created_at: number
  updated_at: number
}

function toPlan(r: PlanRow): LivePlan {
  return {
    id: r.id,
    name: r.name,
    theme: r.theme,
    productId: r.product_id,
    scriptId: r.script_id,
    voiceId: r.voice_id,
    bgmPath: r.bgm_path,
    bgmVolume: r.bgm_volume,
    autoReply: r.auto_reply === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

export function listPlans(): LivePlan[] {
  return run(
    (d) =>
      d
        .prepare('SELECT * FROM live_plans ORDER BY updated_at DESC')
        .all()
        .map((r) => toPlan(r as PlanRow)),
    []
  )
}

export function savePlan(p: LivePlan): void {
  run((d) => {
    d.prepare(
      `INSERT INTO live_plans
         (id, name, theme, product_id, script_id, voice_id, bgm_path, bgm_volume, auto_reply, created_at, updated_at)
       VALUES (@id, @name, @theme, @productId, @scriptId, @voiceId, @bgmPath, @bgmVolume, @autoReply, @createdAt, @updatedAt)
       ON CONFLICT(id) DO UPDATE SET
         name=@name, theme=@theme, product_id=@productId, script_id=@scriptId, voice_id=@voiceId,
         bgm_path=@bgmPath, bgm_volume=@bgmVolume, auto_reply=@autoReply, updated_at=@updatedAt`
    ).run({ ...p, autoReply: p.autoReply ? 1 : 0, createdAt: p.createdAt || Date.now() })
  }, undefined)
}

export function deletePlan(id: string): void {
  run((d) => d.prepare('DELETE FROM live_plans WHERE id = ?').run(id), undefined)
}

/** 首次启动注入内置音色（火山大模型音色库通用音色） */
export function seedVoicePresets(): void {
  run((d) => {
    const count = (d.prepare('SELECT COUNT(*) AS c FROM voices').get() as { c: number }).c
    if (count > 0) return
    const now = Date.now()
    const presets = [
      { name: '亲切女声 · 通用', voiceType: 'BV001_streaming' },
      { name: '沉稳男声 · 通用', voiceType: 'BV002_streaming' },
      { name: '活力女声 · 促销', voiceType: 'BV700_streaming' }
    ]
    for (const p of presets) {
      d.prepare(
        `INSERT INTO voices (id, name, source, voice_type, sample_path, created_at)
         VALUES (?, ?, 'preset', ?, NULL, ?)`
      ).run(randomUUID(), p.name, p.voiceType, now)
    }
  }, undefined)
}

// ---------- 会话 / 评论 / 回复 ----------

export function createSession(id: string, startedAt: number): void {
  run(
    (d) => d.prepare('INSERT OR REPLACE INTO sessions (id, started_at) VALUES (?, ?)').run(id, startedAt),
    undefined
  )
}

export function endSession(id: string, endedAt: number): void {
  run((d) => d.prepare('UPDATE sessions SET ended_at = ? WHERE id = ?').run(endedAt, id), undefined)
}

export function insertComment(c: CommentEvent): void {
  run(
    (d) =>
      d
        .prepare(
          `INSERT OR IGNORE INTO comments (id, session_id, author, author_id, content, kind, intent, created_at)
           VALUES (@id, @sessionId, @author, @authorId, @content, @kind, @intent, @ts)`
        )
        .run(c),
    undefined
  )
  run((d) => d.prepare('UPDATE sessions SET comment_count = comment_count + 1 WHERE id = ?').run(c.sessionId), undefined)
}

export function getComment(id: string): CommentEvent | null {
  return run((d) => {
    const r = d.prepare('SELECT * FROM comments WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined
    if (!r) return null
    return {
      id: r.id as string,
      sessionId: r.session_id as string,
      author: r.author as string,
      authorId: r.author_id as string,
      content: r.content as string,
      kind: r.kind as CommentEvent['kind'],
      intent: r.intent as IntentType | null,
      ts: r.created_at as number
    } as CommentEvent
  }, null)
}

export function listComments(sessionId: string, limit = 500): CommentEvent[] {
  return run(
    (d) =>
      d
        .prepare('SELECT * FROM comments WHERE session_id = ? ORDER BY created_at DESC LIMIT ?')
        .all(sessionId, limit)
        .map(
          (r) =>
            ({
              id: (r as { id: string }).id,
              sessionId: (r as { session_id: string }).session_id,
              author: (r as { author: string }).author,
              authorId: (r as { author_id: string }).author_id,
              content: (r as { content: string }).content,
              kind: (r as { kind: CommentEvent['kind'] }).kind,
              intent: (r as { intent: IntentType | null }).intent,
              ts: (r as { created_at: number }).created_at
            }) as CommentEvent
        ),
    []
  )
}

export function insertReplyLog(r: ReplyItem, sessionId: string, latencyMs: number | null): void {
  run(
    (d) =>
      d
        .prepare(
          `INSERT OR REPLACE INTO reply_log
           (id, comment_id, author, question, reply_text, intent, status, latency_ms, created_at)
           VALUES (@id, @commentId, @author, @question, @replyText, @intent, @status, @latency, @createdAt)`
        )
        .run({ ...r, latency: latencyMs }),
    undefined
  )
  run(
    (d) =>
      d
        .prepare(
          `UPDATE sessions SET
             reply_count = reply_count + 1,
             reply_latency_total_ms = reply_latency_total_ms + COALESCE(?, 0)
           WHERE id = ?`
        )
        .run(latencyMs, sessionId),
    undefined
  )
}

// ---------- 分析 ----------

export function getAnalytics(): {
  sessions: SessionSummary[]
  intents: { intent: string; count: number }[]
  topQuestions: { question: string; count: number }[]
} {
  return run(
    (d) => {
      const sessions = d
        .prepare(
          `SELECT id, started_at, ended_at, comment_count, reply_count, reply_latency_total_ms
           FROM sessions ORDER BY started_at DESC LIMIT 50`
        )
        .all()
        .map((r) => {
          const row = r as {
            id: string
            started_at: number
            ended_at: number | null
            comment_count: number
            reply_count: number
            reply_latency_total_ms: number
          }
          const durationSec = row.ended_at
            ? Math.floor((row.ended_at - row.started_at) / 1000)
            : 0
          return {
            id: row.id,
            startedAt: row.started_at,
            endedAt: row.ended_at,
            durationSec,
            commentCount: row.comment_count,
            replyCount: row.reply_count,
            replyRate: row.comment_count > 0 ? row.reply_count / row.comment_count : 0,
            avgReplyLatencyMs:
              row.reply_count > 0 ? Math.round(row.reply_latency_total_ms / row.reply_count) : null
          } as SessionSummary
        })
      const intents = d
        .prepare(
          `SELECT COALESCE(intent, 'other') AS intent, COUNT(*) AS count
           FROM comments GROUP BY COALESCE(intent, 'other') ORDER BY count DESC`
        )
        .all() as { intent: string; count: number }[]
      const topQuestions = d
        .prepare(
          `SELECT question, COUNT(*) AS count FROM reply_log
           WHERE question IS NOT NULL AND question != ''
           GROUP BY question ORDER BY count DESC LIMIT 10`
        )
        .all() as { question: string; count: number }[]
      return { sessions, intents, topQuestions }
    },
    { sessions: [], intents: [], topQuestions: [] }
  )
}

export function getAllRepliesCsv(): string {
  return run(
    (d) => {
      const rows = d
        .prepare(
          `SELECT created_at, author, question, reply_text, intent, status, latency_ms
           FROM reply_log ORDER BY created_at DESC LIMIT 5000`
        )
        .all() as {
        created_at: number
        author: string
        question: string
        reply_text: string
        intent: string
        status: string
        latency_ms: number | null
      }[]
      const header = '时间,用户,问题,回复,意图,状态,延迟ms'
      const lines = rows.map((r) =>
        [
          new Date(r.created_at).toISOString(),
          csvCell(r.author),
          csvCell(r.question),
          csvCell(r.reply_text),
          r.intent,
          r.status,
          r.latency_ms ?? ''
        ].join(',')
      )
      return '﻿' + [header, ...lines].join('\n')
    },
    ''
  )
}

function csvCell(s: string | null | undefined): string {
  const v = (s ?? '').replace(/"/g, '""')
  return `"${v}"`
}

export { randomUUID }
