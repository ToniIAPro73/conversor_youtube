import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

let _db: Database.Database | null = null;

function getDbPath(): string {
  const dataDir = path.resolve(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, "link2media.sqlite");
}

export function getDb(): Database.Database {
  if (_db) return _db;
  const dbPath = getDbPath();
  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  _db.pragma("synchronous = NORMAL");
  runMigrations(_db);
  return _db;
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = db
    .prepare("SELECT version FROM schema_migrations ORDER BY version")
    .all() as { version: number }[];
  const appliedSet = new Set(applied.map((r) => r.version));

  for (const migration of MIGRATIONS) {
    if (!appliedSet.has(migration.version)) {
      db.transaction(() => {
        db.exec(migration.sql);
        db.prepare("INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)").run(
          migration.version
        );
      })();
    }
  }
}

const MIGRATIONS = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        input_kind TEXT NOT NULL DEFAULT 'remote-url',
        input_reference TEXT NOT NULL,
        input_title TEXT,
        operation TEXT NOT NULL DEFAULT 'transcode-audio',
        output_format TEXT NOT NULL,
        quality TEXT NOT NULL,
        options_json TEXT,
        status TEXT NOT NULL DEFAULT 'queued',
        stage TEXT NOT NULL DEFAULT 'En cola',
        progress REAL NOT NULL DEFAULT 0,
        error_code TEXT,
        error_message TEXT,
        output_file_name TEXT,
        output_relative_path TEXT,
        file_size_bytes INTEGER,
        mime_type TEXT,
        download_token_hash TEXT,
        client_ip TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        started_at TEXT,
        completed_at TEXT,
        cancelled_at TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
      CREATE INDEX IF NOT EXISTS idx_jobs_client_ip ON jobs(client_ip);
      CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_jobs_expires_at ON jobs(expires_at);

      CREATE TABLE IF NOT EXISTS tool_versions (
        tool_name TEXT PRIMARY KEY,
        version TEXT,
        verified_at TEXT NOT NULL DEFAULT (datetime('now')),
        status TEXT NOT NULL DEFAULT 'unknown'
      );
    `,
  },
];
