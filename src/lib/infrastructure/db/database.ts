import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

let _db: Database.Database | null = null;

function getDbPath(): string {
  const dataDir = path.resolve(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, "anclora-filestudio.sqlite");
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

const MIGRATIONS: { version: number; sql: string }[] = [
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
  {
    version: 2,
    sql: `
      -- Extend jobs with universal fields
      ALTER TABLE jobs ADD COLUMN category TEXT;
      ALTER TABLE jobs ADD COLUMN engine_id TEXT;
      ALTER TABLE jobs ADD COLUMN engine_version TEXT;
      ALTER TABLE jobs ADD COLUMN conversion_id TEXT;
      ALTER TABLE jobs ADD COLUMN input_mime_type TEXT;
      ALTER TABLE jobs ADD COLUMN input_format TEXT;
      ALTER TABLE jobs ADD COLUMN output_mime_type TEXT;
      ALTER TABLE jobs ADD COLUMN loss_profile TEXT;
      ALTER TABLE jobs ADD COLUMN batch_id TEXT;
      ALTER TABLE jobs ADD COLUMN warnings_json TEXT;
      ALTER TABLE jobs ADD COLUMN validation_json TEXT;
      ALTER TABLE jobs ADD COLUMN toolchain_snapshot_json TEXT;

      -- Stored file inputs (universal descriptor)
      CREATE TABLE IF NOT EXISTS inputs (
        id TEXT PRIMARY KEY,
        original_name TEXT NOT NULL,
        extension TEXT,
        detected_mime_type TEXT,
        detected_format TEXT,
        category TEXT NOT NULL DEFAULT 'unknown',
        size_bytes INTEGER NOT NULL,
        sha256 TEXT,
        stored_relative_path TEXT NOT NULL,
        attributes_json TEXT,
        warnings_json TEXT,
        analyzed_by TEXT,
        analyzed_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active'
      );
      CREATE INDEX IF NOT EXISTS idx_inputs_category ON inputs(category);
      CREATE INDEX IF NOT EXISTS idx_inputs_expires_at ON inputs(expires_at);

      -- Output artifacts (separate from job state)
      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        output_format TEXT NOT NULL,
        output_mime_type TEXT,
        output_relative_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        size_bytes INTEGER,
        sha256 TEXT,
        validated_at TEXT,
        validation_json TEXT,
        download_token_hash TEXT,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_artifacts_job_id ON artifacts(job_id);

      -- Batch containers
      CREATE TABLE IF NOT EXISTS batches (
        id TEXT PRIMARY KEY,
        name TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        total_jobs INTEGER NOT NULL DEFAULT 0,
        completed_jobs INTEGER NOT NULL DEFAULT 0,
        failed_jobs INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT
      );

      -- Batch ↔ job link
      CREATE TABLE IF NOT EXISTS batch_jobs (
        batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
        job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        position INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (batch_id, job_id)
      );

      -- Toolchain component registry
      CREATE TABLE IF NOT EXISTS tool_components (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        version TEXT,
        license TEXT,
        checksum TEXT,
        source_url TEXT,
        relative_path TEXT,
        status TEXT NOT NULL DEFAULT 'unknown',
        last_verified_at TEXT,
        capabilities_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Application settings (non-sensitive)
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
];
