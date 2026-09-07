/**
 * EventQueue.ts
 *
 * SQLite-backed offline-first queue for app usage events, link events,
 * and screenshot metadata. Survives app kills and network outages.
 * Uses expo-sqlite for the local store.
 */

import * as SQLite from 'expo-sqlite';

export type QueueEventType = 'app_usage' | 'link' | 'screenshot';

export interface QueueEntry {
  id: number;
  event_type: QueueEventType;
  /** JSON-stringified payload matching the Supabase Insert type */
  payload: string;
  /** Local filesystem path — only for screenshot events */
  file_path: string | null;
  retry_count: number;
  created_at: string;
  last_tried: string | null;
}

const DB_NAME = 'watchdog_queue.db';
const MAX_RETRIES = 5;
const BATCH_SIZE = 50;

let _db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync(DB_NAME);
  await _db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS upload_queue (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type   TEXT    NOT NULL,
      payload      TEXT    NOT NULL,
      file_path    TEXT,
      retry_count  INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      last_tried   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_queue_type ON upload_queue(event_type);
    CREATE INDEX IF NOT EXISTS idx_queue_retries ON upload_queue(retry_count);
  `);
  return _db;
}

/**
 * Enqueue a new event for upload.
 */
export async function enqueue(
  eventType: QueueEventType,
  payload: object,
  filePath?: string,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO upload_queue (event_type, payload, file_path) VALUES (?, ?, ?)`,
    [eventType, JSON.stringify(payload), filePath ?? null],
  );
}

/**
 * Get next batch of pending entries (retry_count < MAX_RETRIES).
 * Oldest first, capped at BATCH_SIZE.
 */
export async function dequeueBatch(): Promise<QueueEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<QueueEntry>(
    `SELECT * FROM upload_queue
     WHERE retry_count < ?
     ORDER BY created_at ASC
     LIMIT ?`,
    [MAX_RETRIES, BATCH_SIZE],
  );
  return rows;
}

/**
 * Mark an entry as successfully uploaded — removes it from the queue.
 */
export async function markSuccess(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM upload_queue WHERE id = ?`, [id]);
}

/**
 * Increment retry count and record attempt timestamp.
 */
export async function markFailed(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE upload_queue
     SET retry_count = retry_count + 1,
         last_tried  = datetime('now')
     WHERE id = ?`,
    [id],
  );
}

/**
 * Purge permanently failed entries (retry_count >= MAX_RETRIES).
 * Call periodically to prevent unbounded growth.
 */
export async function purgeFailed(): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    `DELETE FROM upload_queue WHERE retry_count >= ?`,
    [MAX_RETRIES],
  );
  return result.changes;
}

/**
 * Return total pending count for status display.
 */
export async function getPendingCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM upload_queue WHERE retry_count < ?`,
    [MAX_RETRIES],
  );
  return row?.count ?? 0;
}
