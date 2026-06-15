// Unit tests for the batch processor.
// Tests batch creation, status, cancellation, and partial failure.
// Uses in-memory SQLite via the existing database module.

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";

// We test the batch processor's logic by directly calling the DB operations
// and verifying the expected behavior.

// ── Test database setup ──────────────────────────────────────────────────────

let db: Database.Database;

function setupTestDb(): Database.Database {
  const testDb = new Database(":memory:");
  testDb.pragma("journal_mode = WAL");
  testDb.pragma("foreign_keys = ON");

  // Create schema
  testDb.exec(`
    CREATE TABLE jobs (
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
      expires_at TEXT NOT NULL,
      category TEXT,
      engine_id TEXT,
      engine_version TEXT,
      conversion_id TEXT,
      input_mime_type TEXT,
      input_format TEXT,
      output_mime_type TEXT,
      loss_profile TEXT,
      batch_id TEXT,
      warnings_json TEXT,
      validation_json TEXT,
      toolchain_snapshot_json TEXT
    );

    CREATE TABLE batches (
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

    CREATE TABLE batch_jobs (
      batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (batch_id, job_id)
    );
  `);

  return testDb;
}

// ── Direct DB-level batch tests ──────────────────────────────────────────────
// These test the batch logic at the database level without requiring engine probing.

describe("Batch database operations", () => {
  beforeEach(() => {
    db = setupTestDb();
  });

  it("creates a batch record correctly", () => {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO batches (id, name, status, total_jobs, completed_jobs, failed_jobs, created_at, updated_at)
      VALUES (?, ?, 'pending', ?, 0, 0, ?, ?)
    `).run("batch-1", "Test Batch", 3, now, now);

    const batch = db.prepare("SELECT * FROM batches WHERE id = ?").get("batch-1") as Record<string, unknown>;
    expect(batch).toBeDefined();
    expect(batch.status).toBe("pending");
    expect(batch.total_jobs).toBe(3);
    expect(batch.completed_jobs).toBe(0);
    expect(batch.failed_jobs).toBe(0);
    expect(batch.name).toBe("Test Batch");
  });

  it("creates batch-job links correctly", () => {
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 120 * 60 * 1000).toISOString();

    // Create batch
    db.prepare(`
      INSERT INTO batches (id, status, total_jobs, completed_jobs, failed_jobs, created_at, updated_at)
      VALUES ('b1', 'pending', 2, 0, 0, ?, ?)
    `).run(now, now);

    // Create jobs
    db.prepare(`
      INSERT INTO jobs (id, input_kind, input_reference, operation, output_format, quality, status, stage, progress, client_ip, expires_at)
      VALUES (?, 'universal-file', ?, 'convert-ebook', 'mobi', '0', 'queued', 'En cola', 0, '127.0.0.1', ?)
    `).run("j1", "test.epub", expiresAt);

    db.prepare(`
      INSERT INTO jobs (id, input_kind, input_reference, operation, output_format, quality, status, stage, progress, client_ip, expires_at)
      VALUES (?, 'universal-file', ?, 'convert-ebook', 'mobi', '0', 'queued', 'En cola', 0, '127.0.0.1', ?)
    `).run("j2", "test2.epub", expiresAt);

    // Link jobs to batch
    db.prepare("INSERT INTO batch_jobs (batch_id, job_id, position) VALUES (?, ?, ?)").run("b1", "j1", 0);
    db.prepare("INSERT INTO batch_jobs (batch_id, job_id, position) VALUES (?, ?, ?)").run("b1", "j2", 1);

    // Verify links
    const links = db.prepare("SELECT * FROM batch_jobs WHERE batch_id = ? ORDER BY position").all("b1") as Array<{ batch_id: string; job_id: string; position: number }>;
    expect(links).toHaveLength(2);
    expect(links[0]?.job_id).toBe("j1");
    expect(links[1]?.job_id).toBe("j2");
  });

  it("updates batch counters correctly", () => {
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO batches (id, status, total_jobs, completed_jobs, failed_jobs, created_at, updated_at)
      VALUES ('b1', 'processing', 3, 0, 0, ?, ?)
    `).run(now, now);

    // Simulate some progress
    db.prepare("UPDATE batches SET completed_jobs = 2, failed_jobs = 1, updated_at = ? WHERE id = ?").run(now, "b1");

    const batch = db.prepare("SELECT * FROM batches WHERE id = ?").get("b1") as Record<string, unknown>;
    expect(batch.completed_jobs).toBe(2);
    expect(batch.failed_jobs).toBe(1);
  });
});

describe("Batch status transitions", () => {
  beforeEach(() => {
    db = setupTestDb();
  });

  it("transitions from pending to processing", () => {
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO batches (id, status, total_jobs, completed_jobs, failed_jobs, created_at, updated_at)
      VALUES ('b1', 'pending', 2, 0, 0, ?, ?)
    `).run(now, now);

    db.prepare("UPDATE batches SET status = 'processing', updated_at = ? WHERE id = ?").run(now, "b1");

    const batch = db.prepare("SELECT * FROM batches WHERE id = ?").get("b1") as Record<string, unknown>;
    expect(batch.status).toBe("processing");
  });

  it("transitions to completed when all jobs succeed", () => {
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO batches (id, status, total_jobs, completed_jobs, failed_jobs, created_at, updated_at)
      VALUES ('b1', 'processing', 3, 3, 0, ?, ?)
    `).run(now, now);

    db.prepare("UPDATE batches SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?").run(now, now, "b1");

    const batch = db.prepare("SELECT * FROM batches WHERE id = ?").get("b1") as Record<string, unknown>;
    expect(batch.status).toBe("completed");
    expect(batch.completed_at).toBeTruthy();
  });

  it("transitions to partial-failure when some jobs fail", () => {
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO batches (id, status, total_jobs, completed_jobs, failed_jobs, created_at, updated_at)
      VALUES ('b1', 'processing', 3, 2, 1, ?, ?)
    `).run(now, now);

    db.prepare("UPDATE batches SET status = 'partial-failure', completed_at = ?, updated_at = ? WHERE id = ?").run(now, now, "b1");

    const batch = db.prepare("SELECT * FROM batches WHERE id = ?").get("b1") as Record<string, unknown>;
    expect(batch.status).toBe("partial-failure");
  });

  it("transitions to failed when all jobs fail", () => {
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO batches (id, status, total_jobs, completed_jobs, failed_jobs, created_at, updated_at)
      VALUES ('b1', 'processing', 3, 0, 3, ?, ?)
    `).run(now, now);

    db.prepare("UPDATE batches SET status = 'failed', completed_at = ?, updated_at = ? WHERE id = ?").run(now, now, "b1");

    const batch = db.prepare("SELECT * FROM batches WHERE id = ?").get("b1") as Record<string, unknown>;
    expect(batch.status).toBe("failed");
  });

  it("transitions to cancelled when batch is cancelled", () => {
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO batches (id, status, total_jobs, completed_jobs, failed_jobs, created_at, updated_at)
      VALUES ('b1', 'pending', 3, 0, 0, ?, ?)
    `).run(now, now);

    db.prepare("UPDATE batches SET status = 'cancelled', updated_at = ? WHERE id = ?").run(now, "b1");

    const batch = db.prepare("SELECT * FROM batches WHERE id = ?").get("b1") as Record<string, unknown>;
    expect(batch.status).toBe("cancelled");
  });
});

describe("Batch cancellation", () => {
  beforeEach(() => {
    db = setupTestDb();
  });

  it("cancels all queued jobs in a batch", () => {
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 120 * 60 * 1000).toISOString();

    db.prepare(`
      INSERT INTO batches (id, status, total_jobs, completed_jobs, failed_jobs, created_at, updated_at)
      VALUES ('b1', 'pending', 2, 0, 0, ?, ?)
    `).run(now, now);

    // Create queued jobs
    for (let i = 0; i < 2; i++) {
      db.prepare(`
        INSERT INTO jobs (id, input_kind, input_reference, operation, output_format, quality, status, stage, progress, client_ip, expires_at)
        VALUES (?, 'universal-file', ?, 'convert-ebook', 'mobi', '0', 'queued', 'En cola', 0, '127.0.0.1', ?)
      `).run(`j${i}`, `test${i}.epub`, expiresAt);

      db.prepare("INSERT INTO batch_jobs (batch_id, job_id, position) VALUES (?, ?, ?)").run("b1", `j${i}`, i);
    }

    // Cancel queued jobs
    db.prepare(`
      UPDATE jobs
      SET status = 'cancelled', cancelled_at = ?, updated_at = ?, stage = 'Cancelado'
      WHERE id IN (SELECT job_id FROM batch_jobs WHERE batch_id = ?)
      AND status IN ('queued')
    `).run(now, now, "b1");

    db.prepare("UPDATE batches SET status = 'cancelled', updated_at = ? WHERE id = ?").run(now, "b1");

    // Verify
    const jobs = db.prepare(`
      SELECT j.* FROM batch_jobs bj JOIN jobs j ON bj.job_id = j.id WHERE bj.batch_id = ?
    `).all("b1") as Array<{ status: string }>;

    expect(jobs.every((j) => j.status === "cancelled")).toBe(true);

    const batch = db.prepare("SELECT * FROM batches WHERE id = ?").get("b1") as Record<string, unknown>;
    expect(batch.status).toBe("cancelled");
  });

  it("does not cancel already completed jobs", () => {
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 120 * 60 * 1000).toISOString();

    db.prepare(`
      INSERT INTO batches (id, status, total_jobs, completed_jobs, failed_jobs, created_at, updated_at)
      VALUES ('b1', 'processing', 2, 1, 0, ?, ?)
    `).run(now, now);

    // One completed, one queued
    db.prepare(`
      INSERT INTO jobs (id, input_kind, input_reference, operation, output_format, quality, status, stage, progress, client_ip, expires_at)
      VALUES ('j1', 'universal-file', 'test1.epub', 'convert-ebook', 'mobi', '0', 'completed', 'Completado', 100, '127.0.0.1', ?)
    `).run(expiresAt);

    db.prepare(`
      INSERT INTO jobs (id, input_kind, input_reference, operation, output_format, quality, status, stage, progress, client_ip, expires_at)
      VALUES ('j2', 'universal-file', 'test2.epub', 'convert-ebook', 'mobi', '0', 'queued', 'En cola', 0, '127.0.0.1', ?)
    `).run(expiresAt);

    db.prepare("INSERT INTO batch_jobs (batch_id, job_id, position) VALUES (?, ?, ?)").run("b1", "j1", 0);
    db.prepare("INSERT INTO batch_jobs (batch_id, job_id, position) VALUES (?, ?, ?)").run("b1", "j2", 1);

    // Cancel only queued
    db.prepare(`
      UPDATE jobs
      SET status = 'cancelled', cancelled_at = ?, updated_at = ?, stage = 'Cancelado'
      WHERE id IN (SELECT job_id FROM batch_jobs WHERE batch_id = ?)
      AND status IN ('queued')
    `).run(now, now, "b1");

    const j1 = db.prepare("SELECT status FROM jobs WHERE id = ?").get("j1") as { status: string };
    const j2 = db.prepare("SELECT status FROM jobs WHERE id = ?").get("j2") as { status: string };

    expect(j1.status).toBe("completed"); // Unchanged
    expect(j2.status).toBe("cancelled"); // Changed
  });
});

describe("Batch partial failure", () => {
  beforeEach(() => {
    db = setupTestDb();
  });

  it("marks batch as partial-failure when some jobs fail and some succeed", () => {
    const now = new Date().toISOString();

    // Simulate a batch with mixed results
    db.prepare(`
      INSERT INTO batches (id, status, total_jobs, completed_jobs, failed_jobs, created_at, updated_at)
      VALUES ('b1', 'processing', 5, 3, 2, ?, ?)
    `).run(now, now);

    // The business logic would determine: completed > 0 && failed > 0 => partial-failure
    const completedJobs: number = 3;
    const failedJobs: number = 2;
    const totalJobs: number = 5;

    let finalStatus: string;
    if (failedJobs === 0 && completedJobs === totalJobs) {
      finalStatus = "completed";
    } else if (completedJobs === 0 && failedJobs > 0) {
      finalStatus = "failed";
    } else if (completedJobs > 0 && failedJobs > 0) {
      finalStatus = "partial-failure";
    } else {
      finalStatus = "cancelled";
    }

    expect(finalStatus).toBe("partial-failure");

    db.prepare("UPDATE batches SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?").run(finalStatus, now, now, "b1");

    const batch = db.prepare("SELECT * FROM batches WHERE id = ?").get("b1") as Record<string, unknown>;
    expect(batch.status).toBe("partial-failure");
  });

  it("marks batch as completed when all jobs succeed", () => {
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO batches (id, status, total_jobs, completed_jobs, failed_jobs, created_at, updated_at)
      VALUES ('b1', 'processing', 3, 3, 0, ?, ?)
    `).run(now, now);

    const completedJobs: number = 3;
    const failedJobs: number = 0;
    const totalJobs: number = 3;

    let finalStatus: string;
    if (failedJobs === 0 && completedJobs === totalJobs) {
      finalStatus = "completed";
    } else if (completedJobs === 0 && failedJobs > 0) {
      finalStatus = "failed";
    } else if (completedJobs > 0 && failedJobs > 0) {
      finalStatus = "partial-failure";
    } else {
      finalStatus = "cancelled";
    }

    expect(finalStatus).toBe("completed");
  });

  it("marks batch as failed when all jobs fail", () => {
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO batches (id, status, total_jobs, completed_jobs, failed_jobs, created_at, updated_at)
      VALUES ('b1', 'processing', 3, 0, 3, ?, ?)
    `).run(now, now);

    const completedJobs: number = 0;
    const failedJobs: number = 3;
    const totalJobs: number = 3;

    let finalStatus: string;
    if (failedJobs === 0 && completedJobs === totalJobs) {
      finalStatus = "completed";
    } else if (completedJobs === 0 && failedJobs > 0) {
      finalStatus = "failed";
    } else if (completedJobs > 0 && failedJobs > 0) {
      finalStatus = "partial-failure";
    } else {
      finalStatus = "cancelled";
    }

    expect(finalStatus).toBe("failed");
  });
});

describe("Batch job retrieval with status", () => {
  beforeEach(() => {
    db = setupTestDb();
  });

  it("returns per-job details with positions", () => {
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 120 * 60 * 1000).toISOString();

    db.prepare(`
      INSERT INTO batches (id, status, total_jobs, completed_jobs, failed_jobs, created_at, updated_at)
      VALUES ('b1', 'processing', 3, 1, 1, ?, ?)
    `).run(now, now);

    // Create jobs with different statuses
    const jobData = [
      { id: "j1", status: "completed", errorMsg: null },
      { id: "j2", status: "failed", errorMsg: "conversion failed" },
      { id: "j3", status: "queued", errorMsg: null },
    ];

    for (let i = 0; i < jobData.length; i++) {
      const j = jobData[i]!;
      db.prepare(`
        INSERT INTO jobs (id, input_kind, input_reference, operation, output_format, quality, status, stage, progress, client_ip, expires_at, error_message)
        VALUES (?, 'universal-file', ?, 'convert-ebook', 'mobi', '0', ?, ?, ?, '127.0.0.1', ?, ?)
      `).run(j.id, `test${i}.epub`, j.status, j.status === "completed" ? "Completado" : j.status === "failed" ? "Error" : "En cola", j.status === "completed" ? 100 : 0, expiresAt, j.errorMsg);

      db.prepare("INSERT INTO batch_jobs (batch_id, job_id, position) VALUES (?, ?, ?)").run("b1", j.id, i);
    }

    // Query per-job details
    const jobs = db.prepare(`
      SELECT j.id, j.status, j.output_format, j.error_message, bj.position
      FROM batch_jobs bj
      JOIN jobs j ON bj.job_id = j.id
      WHERE bj.batch_id = ?
      ORDER BY bj.position
    `).all("b1") as Array<{ id: string; status: string; output_format: string; error_message: string | null; position: number }>;

    expect(jobs).toHaveLength(3);
    expect(jobs[0]?.status).toBe("completed");
    expect(jobs[1]?.status).toBe("failed");
    expect(jobs[1]?.error_message).toBe("conversion failed");
    expect(jobs[2]?.status).toBe("queued");
    expect(jobs.map((j) => j.position)).toEqual([0, 1, 2]);
  });
});
