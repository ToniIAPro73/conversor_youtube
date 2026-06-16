-- Migration 001 — Initial schema for Anclora FileStudio Service
-- Applies: service_clients, uploads, jobs, job_attempts, job_events, job_artifacts
-- All timestamps stored as TIMESTAMPTZ; IDs as TEXT (ULID)

BEGIN;

-- ── Service clients ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS service_clients (
  id             TEXT PRIMARY KEY,
  workspace_id   TEXT NOT NULL,
  name           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','revoked')),
  scopes         TEXT[] NOT NULL DEFAULT '{}',
  quota_jobs_day INTEGER NOT NULL DEFAULT 100,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_clients_workspace ON service_clients (workspace_id);

-- ── Service client keys (JWT public keys) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS service_client_keys (
  id          TEXT PRIMARY KEY,
  client_id   TEXT NOT NULL REFERENCES service_clients(id) ON DELETE CASCADE,
  kid         TEXT NOT NULL UNIQUE,
  public_key  TEXT NOT NULL,  -- PEM
  algorithm   TEXT NOT NULL CHECK (algorithm IN ('EdDSA','RS256')),
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_client_keys_client ON service_client_keys (client_id);
CREATE INDEX IF NOT EXISTS idx_client_keys_kid ON service_client_keys (kid) WHERE status = 'active';

-- ── Uploads ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS uploads (
  id           TEXT PRIMARY KEY,
  client_id    TEXT NOT NULL REFERENCES service_clients(id),
  workspace_id TEXT NOT NULL,
  filename     TEXT NOT NULL,
  mime_type    TEXT NOT NULL,
  size_bytes   BIGINT NOT NULL,
  sha256       TEXT NOT NULL,
  storage_key  TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready','consumed','expired','deleted')),
  descriptor   JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL,
  deleted_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_uploads_client ON uploads (client_id, status);
CREATE INDEX IF NOT EXISTS idx_uploads_expires ON uploads (expires_at) WHERE status = 'ready';

-- ── Jobs ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS jobs (
  id               TEXT PRIMARY KEY,
  client_id        TEXT NOT NULL REFERENCES service_clients(id),
  workspace_id     TEXT NOT NULL,
  operation        TEXT NOT NULL,
  upload_id        TEXT REFERENCES uploads(id),
  status           TEXT NOT NULL DEFAULT 'created' CHECK (status IN (
    'created','validating','queued','leased','processing',
    'cancelling','completed','partial_failure','failed',
    'cancelled','expired','deleted'
  )),
  priority         INTEGER NOT NULL DEFAULT 5,
  options          JSONB NOT NULL DEFAULT '{}',
  metadata         JSONB NOT NULL DEFAULT '{}',
  engine_id        TEXT,
  queue_name       TEXT,
  idempotency_key  TEXT,
  correlation_id   TEXT,
  input_path       TEXT,
  output_path      TEXT,
  sha256_input     TEXT,
  sha256_output    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  queued_at        TIMESTAMPTZ,
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ,
  deleted_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_jobs_client ON jobs (client_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_queue ON jobs (queue_name, status, priority DESC, created_at)
  WHERE status IN ('queued','leased');
CREATE INDEX IF NOT EXISTS idx_jobs_idempotency ON jobs (client_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_expires ON jobs (expires_at)
  WHERE status NOT IN ('completed','partial_failure','failed','cancelled','expired','deleted');

-- ── Job leases (worker coordination) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS job_leases (
  job_id      TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  worker_id   TEXT NOT NULL,
  leased_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL
);

-- ── Job attempts ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS job_attempts (
  id          TEXT PRIMARY KEY,
  job_id      TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  worker_id   TEXT NOT NULL,
  attempt_n   INTEGER NOT NULL,
  status      TEXT NOT NULL,
  engine_id   TEXT,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at    TIMESTAMPTZ,
  error       TEXT,
  duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_job_attempts_job ON job_attempts (job_id, attempt_n);

-- ── Job events (audit log / SSE source) ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS job_events (
  id          BIGSERIAL PRIMARY KEY,
  job_id      TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_events_job ON job_events (job_id, id);

-- ── Job artifacts (output files) ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS job_artifacts (
  id          TEXT PRIMARY KEY,
  job_id      TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  filename    TEXT NOT NULL,
  mime_type   TEXT NOT NULL,
  size_bytes  BIGINT NOT NULL,
  sha256      TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_artifacts_job ON job_artifacts (job_id);
CREATE INDEX IF NOT EXISTS idx_job_artifacts_expires ON job_artifacts (expires_at)
  WHERE deleted_at IS NULL;

-- ── Idempotency keys ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id              TEXT PRIMARY KEY,
  client_id       TEXT NOT NULL,
  key             TEXT NOT NULL,
  request_hash    TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body   JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,
  UNIQUE (client_id, key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys (expires_at);

-- ── Webhook endpoints ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id          TEXT PRIMARY KEY,
  client_id   TEXT NOT NULL REFERENCES service_clients(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  secret_hash TEXT NOT NULL,  -- SHA-256 of HMAC secret
  events      TEXT[] NOT NULL DEFAULT '{}',
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_client ON webhook_endpoints (client_id, status);

-- ── Webhook deliveries ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id              TEXT PRIMARY KEY,
  endpoint_id     TEXT NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,
  payload         JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','failed')),
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  response_status INTEGER,
  response_body   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_retry_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending ON webhook_deliveries (next_retry_at)
  WHERE status = 'pending';

-- ── Usage counters ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS usage_counters (
  id          TEXT PRIMARY KEY,
  client_id   TEXT NOT NULL REFERENCES service_clients(id) ON DELETE CASCADE,
  period      DATE NOT NULL,
  jobs_count  INTEGER NOT NULL DEFAULT 0,
  bytes_in    BIGINT NOT NULL DEFAULT 0,
  bytes_out   BIGINT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, period)
);

-- ── Audit events ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_events (
  id          BIGSERIAL PRIMARY KEY,
  client_id   TEXT,
  actor       TEXT,
  action      TEXT NOT NULL,
  resource_id TEXT,
  payload     JSONB NOT NULL DEFAULT '{}',
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_client ON audit_events (client_id, created_at DESC);

-- ── Worker heartbeats ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS worker_heartbeats (
  worker_id    TEXT PRIMARY KEY,
  queue_names  TEXT[] NOT NULL,
  status       TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','busy','draining')),
  jobs_done    INTEGER NOT NULL DEFAULT 0,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Schema version ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version) VALUES ('001_initial_schema')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
