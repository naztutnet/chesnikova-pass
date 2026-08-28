import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export class RequestStore {
  constructor({ path, cipher }) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.cipher = cipher;
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS requests (
        id TEXT PRIMARY KEY,
        telegram_user_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        status TEXT NOT NULL,
        encrypted_payload TEXT NOT NULL,
        external_id TEXT,
        external_status TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(telegram_user_id, idempotency_key)
      );
      CREATE INDEX IF NOT EXISTS requests_user_created ON requests(telegram_user_id, created_at DESC);
    `);
  }

  claim({ userId, idempotencyKey, requestHash, payload }) {
    const now = new Date().toISOString();
    const id = randomUUID();
    try {
      this.db.prepare(`INSERT INTO requests (id, telegram_user_id, idempotency_key, request_hash, status, encrypted_payload, created_at, updated_at) VALUES (?, ?, ?, ?, 'SUBMITTING', ?, ?, ?)`).run(
        id, userId, idempotencyKey, requestHash, this.cipher.encrypt(payload), now, now,
      );
      return { kind: "CLAIMED", request: this.getByIdForUser(id, userId) };
    } catch (error) {
      // node:sqlite currently reports extended constraint failures as
      // ERR_SQLITE_ERROR with errcode 2067 (SQLITE_CONSTRAINT_UNIQUE).
      if (!isUniqueConstraint(error)) throw error;
      const existing = this.getByIdempotencyKey(userId, idempotencyKey);
      if (!existing) throw error;
      if (existing.requestHash !== requestHash) return { kind: "MISMATCH", request: existing };
      if (existing.status === "SUBMITTING") return { kind: "IN_PROGRESS", request: existing };
      return { kind: "REPLAY", request: existing };
    }
  }

  complete(id, userId, { status, externalId = null, externalStatus = null }) {
    const now = new Date().toISOString();
    this.db.prepare(`UPDATE requests SET status = ?, external_id = ?, external_status = ?, updated_at = ? WHERE id = ? AND telegram_user_id = ?`).run(status, externalId, externalStatus, now, id, userId);
    return this.getByIdForUser(id, userId);
  }

  getByIdForUser(id, userId) {
    const row = this.db.prepare(`SELECT * FROM requests WHERE id = ? AND telegram_user_id = ?`).get(id, userId);
    return row ? mapRow(row, this.cipher) : null;
  }

  getByIdempotencyKey(userId, key) {
    const row = this.db.prepare(`SELECT * FROM requests WHERE telegram_user_id = ? AND idempotency_key = ?`).get(userId, key);
    return row ? mapRow(row, this.cipher) : null;
  }

  listByUser(userId, { page, pageSize, status = null }) {
    const offset = (page - 1) * pageSize;
    const where = status ? "telegram_user_id = ? AND status = ?" : "telegram_user_id = ?";
    const args = status ? [userId, status] : [userId];
    const totalItems = Number(this.db.prepare(`SELECT COUNT(*) AS count FROM requests WHERE ${where}`).get(...args).count);
    const rows = this.db.prepare(`SELECT * FROM requests WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...args, pageSize, offset);
    return { data: rows.map((row) => mapRow(row, this.cipher)), pagination: { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) } };
  }

  close() { this.db.close(); }
}

function isUniqueConstraint(error) {
  return String(error?.code || "").startsWith("ERR_SQLITE_CONSTRAINT")
    || error?.errcode === 2067
    || /UNIQUE constraint failed/i.test(String(error?.message || ""));
}

function mapRow(row, cipher) {
  return {
    id: row.id,
    userId: row.telegram_user_id,
    idempotencyKey: row.idempotency_key,
    requestHash: row.request_hash,
    status: row.status,
    externalId: row.external_id,
    externalStatus: row.external_status,
    payload: cipher.decrypt(row.encrypted_payload),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
