// Run all SQL migrations in order; safe to re-run (idempotent via ON CONFLICT).
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "migrations");

export async function runMigrations(sql: postgres.Sql): Promise<void> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const content = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
    await sql.unsafe(content);
  }
}
