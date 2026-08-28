import "server-only";

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import {
  researchThreadMetadataSchema,
  researchThreadRecordSchema,
  researchThreadSnapshotSchema,
  type ResearchThreadMetadata,
  type ResearchThreadRecord,
  type ResearchThreadSnapshot,
} from "./contracts.ts";

export type ThreadStore = {
  create(input: { id: string; title: string; snapshot: ResearchThreadSnapshot }): Promise<ResearchThreadRecord>;
  list(limit?: number): Promise<ResearchThreadMetadata[]>;
  load(id: string): Promise<ResearchThreadRecord | null>;
  save(input: { id: string; expectedRevision: number; snapshot: ResearchThreadSnapshot }): Promise<ResearchThreadRecord>;
  delete(id: string): Promise<boolean>;
};

export class ThreadConflictError extends Error {
  readonly code = "thread_revision_conflict";

  constructor() {
    super("The Research Thread changed elsewhere; the newer version was preserved.");
    this.name = "ThreadConflictError";
  }
}

export class ThreadNotFoundError extends Error {
  readonly code = "thread_not_found";

  constructor() {
    super("The Research Thread no longer exists.");
    this.name = "ThreadNotFoundError";
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class MemoryThreadStore implements ThreadStore {
  private readonly rows = new Map<string, ResearchThreadRecord>();
  private tick = 0;

  async create(input: { id: string; title: string; snapshot: ResearchThreadSnapshot }): Promise<ResearchThreadRecord> {
    if (this.rows.has(input.id)) throw new ThreadConflictError();
    const now = new Date(Date.UTC(2026, 0, 1, 0, 0, this.tick++)).toISOString();
    const row = researchThreadRecordSchema.parse({
      id: input.id,
      title: input.title,
      snapshot: input.snapshot,
      revision: 1,
      created_at: now,
      updated_at: now,
    });
    this.rows.set(input.id, clone(row));
    return clone(row);
  }

  async list(limit = 50): Promise<ResearchThreadMetadata[]> {
    return [...this.rows.values()]
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
      .slice(0, Math.min(50, Math.max(1, limit)))
      .map((row) => researchThreadMetadataSchema.parse({
        id: row.id,
        title: row.title,
        revision: row.revision,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));
  }

  async load(id: string): Promise<ResearchThreadRecord | null> {
    const row = this.rows.get(id);
    return row ? clone(row) : null;
  }

  async save(input: { id: string; expectedRevision: number; snapshot: ResearchThreadSnapshot }): Promise<ResearchThreadRecord> {
    const current = this.rows.get(input.id);
    if (!current) throw new ThreadNotFoundError();
    if (current.revision !== input.expectedRevision) throw new ThreadConflictError();
    const updated = researchThreadRecordSchema.parse({
      ...current,
      snapshot: input.snapshot,
      revision: current.revision + 1,
      updated_at: new Date(Date.UTC(2026, 0, 1, 0, 0, this.tick++)).toISOString(),
    });
    this.rows.set(input.id, clone(updated));
    return clone(updated);
  }

  async delete(id: string): Promise<boolean> {
    return this.rows.delete(id);
  }
}

type DatabaseRow = {
  id: unknown;
  title: unknown;
  snapshot?: unknown;
  revision: unknown;
  created_at: unknown;
  updated_at: unknown;
};

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(String(value)).toISOString();
}

function recordFromRow(row: DatabaseRow): ResearchThreadRecord {
  return researchThreadRecordSchema.parse({
    id: row.id,
    title: row.title,
    snapshot: row.snapshot,
    revision: Number(row.revision),
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  });
}

function metadataFromRow(row: DatabaseRow): ResearchThreadMetadata {
  return researchThreadMetadataSchema.parse({
    id: row.id,
    title: row.title,
    revision: Number(row.revision),
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  });
}

export function isTransientDatabaseError(error: unknown): boolean {
  if (error instanceof DOMException) return error.name === "TimeoutError";
  if (!error || typeof error !== "object") return false;
  const value = error as { status?: unknown; statusCode?: unknown; code?: unknown; message?: unknown };
  const status = typeof value.status === "number"
    ? value.status
    : typeof value.statusCode === "number" ? value.statusCode : undefined;
  if (status === 408 || status === 429 || (status !== undefined && status >= 500)) return true;
  if (typeof value.code === "string" && /^(?:08|53|57P0)/.test(value.code)) return true;
  return /timeout|timed out|fetch failed|econnreset|temporar|connection terminated/i.test(String(value.message ?? ""));
}

export async function withDatabaseRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isTransientDatabaseError(error)) throw error;
    return operation();
  }
}

export class NeonThreadStore implements ThreadStore {
  private readonly sql: NeonQueryFunction<false, false>;

  constructor(connectionString: string) {
    if (!connectionString.trim()) throw new Error("database_url_missing");
    this.sql = neon(connectionString);
  }

  async create(input: { id: string; title: string; snapshot: ResearchThreadSnapshot }): Promise<ResearchThreadRecord> {
    const snapshot = researchThreadSnapshotSchema.parse(input.snapshot);
    const rows = await withDatabaseRetry(() => this.sql.query(
      `INSERT INTO research_threads (id, title, snapshot)
       VALUES ($1::uuid, $2, $3::jsonb)
       RETURNING id, title, snapshot, revision, created_at, updated_at`,
      [input.id, input.title, JSON.stringify(snapshot)],
    ));
    return recordFromRow(rows[0] as DatabaseRow);
  }

  async list(limit = 50): Promise<ResearchThreadMetadata[]> {
    const rows = await withDatabaseRetry(() => this.sql.query(
      `SELECT id, title, revision, created_at, updated_at
       FROM research_threads
       ORDER BY updated_at DESC
       LIMIT $1`,
      [Math.min(50, Math.max(1, limit))],
    ));
    return rows.map((row) => metadataFromRow(row as DatabaseRow));
  }

  async load(id: string): Promise<ResearchThreadRecord | null> {
    const rows = await withDatabaseRetry(() => this.sql.query(
      `SELECT id, title, snapshot, revision, created_at, updated_at
       FROM research_threads
       WHERE id = $1::uuid`,
      [id],
    ));
    return rows[0] ? recordFromRow(rows[0] as DatabaseRow) : null;
  }

  async save(input: { id: string; expectedRevision: number; snapshot: ResearchThreadSnapshot }): Promise<ResearchThreadRecord> {
    const snapshot = researchThreadSnapshotSchema.parse(input.snapshot);
    const rows = await withDatabaseRetry(() => this.sql.query(
      `UPDATE research_threads
       SET snapshot = $1::jsonb, revision = revision + 1, updated_at = now()
       WHERE id = $2::uuid AND revision = $3
       RETURNING id, title, snapshot, revision, created_at, updated_at`,
      [JSON.stringify(snapshot), input.id, input.expectedRevision],
    ));
    if (rows[0]) return recordFromRow(rows[0] as DatabaseRow);
    const current = await this.load(input.id);
    if (!current) throw new ThreadNotFoundError();
    throw new ThreadConflictError();
  }

  async delete(id: string): Promise<boolean> {
    const rows = await withDatabaseRetry(() => this.sql.query(
      "DELETE FROM research_threads WHERE id = $1::uuid RETURNING id",
      [id],
    ));
    return rows.length > 0;
  }
}
