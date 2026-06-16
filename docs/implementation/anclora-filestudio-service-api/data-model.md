# Data Model — Anclora FileStudio Service (PostgreSQL)

## Convenciones

- IDs: `<prefix>_<ulid>` (e.g. `job_01jxx...`). Generados con `ulid` o `@std/ulid`.
- Timestamps: `TIMESTAMPTZ`, UTC.
- Soft delete: columna `deleted_at TIMESTAMPTZ`.
- Enums: tipo PostgreSQL nativo.
- Migraciones: `node-pg-migrate`, carpeta `apps/api/migrations/`.

## Tablas

### `service_clients`

```sql
CREATE TABLE service_clients (
  id            TEXT PRIMARY KEY,            -- "client_01..."
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active',  -- active | suspended | revoked
  scopes        TEXT[] NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);
```

### `service_client_keys`

```sql
CREATE TABLE service_client_keys (
  id            TEXT PRIMARY KEY,
  client_id     TEXT NOT NULL REFERENCES service_clients(id),
  kid           TEXT NOT NULL UNIQUE,
  algorithm     TEXT NOT NULL,  -- EdDSA | RS256
  public_key    TEXT NOT NULL,  -- PEM
  status        TEXT NOT NULL DEFAULT 'active',  -- active | revoked
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ
);
```

### `uploads`

```sql
CREATE TABLE uploads (
  id            TEXT PRIMARY KEY,
  client_id     TEXT NOT NULL REFERENCES service_clients(id),
  workspace_id  TEXT NOT NULL,
  filename      TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  size_bytes    BIGINT NOT NULL,
  sha256        TEXT NOT NULL,
  storage_key   TEXT NOT NULL,  -- referencia en ArtifactStorage
  status        TEXT NOT NULL DEFAULT 'ready',  -- ready | consumed | expired | deleted
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,
  deleted_at    TIMESTAMPTZ
);
```

### `jobs`

```sql
CREATE TABLE jobs (
  id              TEXT PRIMARY KEY,
  client_id       TEXT NOT NULL REFERENCES service_clients(id),
  workspace_id    TEXT NOT NULL,
  operation       TEXT NOT NULL,
  upload_id       TEXT REFERENCES uploads(id),
  status          TEXT NOT NULL DEFAULT 'created',
  priority        INT NOT NULL DEFAULT 5,
  options         JSONB NOT NULL DEFAULT '{}',
  metadata        JSONB NOT NULL DEFAULT '{}',
  webhook_endpoint_id TEXT REFERENCES webhook_endpoints(id),
  idempotency_key TEXT,
  correlation_id  TEXT,
  queue_name      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  queued_at       TIMESTAMPTZ,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ,
  UNIQUE (client_id, idempotency_key)  -- idempotencia por cliente
);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_client_id ON jobs(client_id);
CREATE INDEX idx_jobs_expires_at ON jobs(expires_at) WHERE deleted_at IS NULL;
```

### `job_attempts`

```sql
CREATE TABLE job_attempts (
  id          TEXT PRIMARY KEY,
  job_id      TEXT NOT NULL REFERENCES jobs(id),
  worker_id   TEXT NOT NULL,
  attempt_num INT NOT NULL,
  status      TEXT NOT NULL,  -- running | completed | failed | timeout
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  error       TEXT,
  logs        TEXT
);
```

### `job_events`

```sql
CREATE TABLE job_events (
  id          TEXT PRIMARY KEY,
  job_id      TEXT NOT NULL REFERENCES jobs(id),
  event_type  TEXT NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_job_events_job_id ON job_events(job_id);
```

### `job_artifacts`

```sql
CREATE TABLE job_artifacts (
  id            TEXT PRIMARY KEY,
  job_id        TEXT NOT NULL REFERENCES jobs(id),
  storage_key   TEXT NOT NULL,
  filename      TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  size_bytes    BIGINT NOT NULL,
  sha256        TEXT NOT NULL,
  download_token_hash TEXT,
  token_expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ,
  deleted_at    TIMESTAMPTZ
);
```

### `batches`

```sql
CREATE TABLE batches (
  id          TEXT PRIMARY KEY,
  client_id   TEXT NOT NULL REFERENCES service_clients(id),
  workspace_id TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'created',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  deleted_at  TIMESTAMPTZ
);
```

### `batch_items`

```sql
CREATE TABLE batch_items (
  id        TEXT PRIMARY KEY,
  batch_id  TEXT NOT NULL REFERENCES batches(id),
  job_id    TEXT REFERENCES jobs(id),
  position  INT NOT NULL,
  status    TEXT NOT NULL DEFAULT 'pending'
);
```

### `idempotency_keys`

```sql
CREATE TABLE idempotency_keys (
  id              TEXT PRIMARY KEY,
  client_id       TEXT NOT NULL,
  key             TEXT NOT NULL,
  request_hash    TEXT NOT NULL,  -- hash del payload
  response_status INT NOT NULL,
  response_body   JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,
  UNIQUE (client_id, key)
);
CREATE INDEX idx_idempotency_expires ON idempotency_keys(expires_at);
```

### `webhook_endpoints`

```sql
CREATE TABLE webhook_endpoints (
  id          TEXT PRIMARY KEY,
  client_id   TEXT NOT NULL REFERENCES service_clients(id),
  url         TEXT NOT NULL,
  events      TEXT[] NOT NULL,
  secret_hash TEXT NOT NULL,  -- hash de HMAC secret
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);
```

### `webhook_deliveries`

```sql
CREATE TABLE webhook_deliveries (
  id              TEXT PRIMARY KEY,
  endpoint_id     TEXT NOT NULL REFERENCES webhook_endpoints(id),
  job_id          TEXT REFERENCES jobs(id),
  event_type      TEXT NOT NULL,
  event_id        TEXT NOT NULL UNIQUE,
  payload         JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  attempt_count   INT NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `usage_counters`

```sql
CREATE TABLE usage_counters (
  client_id     TEXT NOT NULL,
  window_start  TIMESTAMPTZ NOT NULL,
  window_type   TEXT NOT NULL,  -- minute | hour | day
  metric        TEXT NOT NULL,
  value         BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (client_id, window_start, window_type, metric)
);
```

### `audit_events`

```sql
CREATE TABLE audit_events (
  id            TEXT PRIMARY KEY,
  client_id     TEXT,
  workspace_id  TEXT,
  event_type    TEXT NOT NULL,
  resource_type TEXT,
  resource_id   TEXT,
  ip_hash       TEXT,
  ua_hash       TEXT,
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata      JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_audit_timestamp ON audit_events(timestamp);
```

### `worker_heartbeats`

```sql
CREATE TABLE worker_heartbeats (
  worker_id   TEXT PRIMARY KEY,
  queue_name  TEXT NOT NULL,
  status      TEXT NOT NULL,  -- idle | busy | draining
  job_id      TEXT,
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `schema_migrations`

Gestionada por `node-pg-migrate` automáticamente.

## Notas

- No se almacenan archivos binarios en PostgreSQL.
- No se almacenan tokens raw — solo hashes SHA-256.
- La tabla `idempotency_keys` usa `UNIQUE (client_id, key)` con `ON CONFLICT DO NOTHING`
  o `ON CONFLICT DO UPDATE` para devolver respuesta previa.
- `usage_counters` se actualiza con `INSERT ... ON CONFLICT DO UPDATE SET value = value + 1`.
