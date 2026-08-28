import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required; no migration was attempted.");

const sql = neon(connectionString);
const migration = await readFile(resolve(process.cwd(), "migrations/001_research_threads.sql"), "utf8");
const statements = migration
  .split(/;\s*(?:\n|$)/)
  .map((statement) => statement.trim())
  .filter(Boolean);

for (const statement of statements) await sql.query(statement);
console.log(`Research Threads migration applied (${statements.length} idempotent statements).`);
