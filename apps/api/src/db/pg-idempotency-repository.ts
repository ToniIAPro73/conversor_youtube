import postgres from "postgres";
import { monotonicFactory } from "ulid";
import type { IdempotencyRepository, IdempotencyRecord } from "@anclora/filestudio-core";

function jsonb(v: object): postgres.JSONValue {
  return JSON.parse(JSON.stringify(v)) as postgres.JSONValue;
}

const ulid = monotonicFactory();

function rowToRecord(row: Record<string, unknown>): IdempotencyRecord {
  return {
    id: row.id as string,
    clientId: row.client_id as string,
    key: row.key as string,
    requestHash: row.request_hash as string,
    responseStatus: row.response_status as number,
    responseBody: row.response_body as unknown,
    createdAt: row.created_at as Date,
    expiresAt: row.expires_at as Date,
  };
}

export class PostgresIdempotencyRepository implements IdempotencyRepository {
  constructor(private readonly sql: postgres.Sql) {}

  async find(clientId: string, key: string): Promise<IdempotencyRecord | null> {
    const rows = await this.sql`
      SELECT * FROM idempotency_keys
      WHERE client_id = ${clientId} AND key = ${key} AND expires_at > NOW()
    `;
    if (rows.length === 0) return null;
    return rowToRecord(rows[0] as Record<string, unknown>);
  }

  async save(record: Omit<IdempotencyRecord, "id" | "createdAt">): Promise<IdempotencyRecord> {
    const id = ulid();
    const rows = await this.sql`
      INSERT INTO idempotency_keys (
        id, client_id, key, request_hash, response_status, response_body, expires_at
      ) VALUES (
        ${id}, ${record.clientId}, ${record.key}, ${record.requestHash},
        ${record.responseStatus}, ${this.sql.json(jsonb(record.responseBody as object))}, ${record.expiresAt}
      )
      ON CONFLICT (client_id, key) DO UPDATE
        SET request_hash    = EXCLUDED.request_hash,
            response_status = EXCLUDED.response_status,
            response_body   = EXCLUDED.response_body,
            expires_at      = EXCLUDED.expires_at
      RETURNING *
    `;
    return rowToRecord(rows[0] as Record<string, unknown>);
  }

  async deleteExpired(before: Date): Promise<number> {
    const rows = await this.sql`
      DELETE FROM idempotency_keys WHERE expires_at < ${before} RETURNING id
    `;
    return rows.length;
  }
}
