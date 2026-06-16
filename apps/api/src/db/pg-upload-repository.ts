import postgres from "postgres";
import { monotonicFactory } from "ulid";
import type {
  UploadRepository,
  UploadRecord,
  CreateUploadInput,
} from "@anclora/filestudio-core";

const ulid = monotonicFactory();
const UPLOAD_TTL_MINUTES_DEFAULT = 60;

function rowToUploadRecord(row: Record<string, unknown>): UploadRecord {
  return {
    id: row.id as string,
    clientId: row.client_id as string,
    workspaceId: row.workspace_id as string,
    filename: row.filename as string,
    mimeType: row.mime_type as string,
    sizeBytes: Number(row.size_bytes),
    sha256: row.sha256 as string,
    storageKey: row.storage_key as string,
    status: row.status as UploadRecord["status"],
    descriptor: (row.descriptor as UploadRecord["descriptor"]) ?? null,
    createdAt: row.created_at as Date,
    expiresAt: row.expires_at as Date,
    deletedAt: (row.deleted_at as Date | null) ?? null,
  };
}

export class PostgresUploadRepository implements UploadRepository {
  constructor(private readonly sql: postgres.Sql) {}

  async create(input: CreateUploadInput): Promise<UploadRecord> {
    const id = ulid();
    const ttl = input.ttlMinutes ?? UPLOAD_TTL_MINUTES_DEFAULT;
    const expiresAt = new Date(Date.now() + ttl * 60 * 1000);

    const rows = await this.sql`
      INSERT INTO uploads (
        id, client_id, workspace_id, filename, mime_type,
        size_bytes, sha256, storage_key, expires_at
      ) VALUES (
        ${id}, ${input.clientId}, ${input.workspaceId}, ${input.filename},
        ${input.mimeType}, ${input.sizeBytes}, ${input.sha256},
        ${input.storageKey}, ${expiresAt}
      )
      RETURNING *
    `;
    return rowToUploadRecord(rows[0] as Record<string, unknown>);
  }

  async getById(id: string): Promise<UploadRecord | null> {
    const rows = await this.sql`
      SELECT * FROM uploads WHERE id = ${id} AND deleted_at IS NULL
    `;
    if (rows.length === 0) return null;
    return rowToUploadRecord(rows[0] as Record<string, unknown>);
  }

  async getByIdAndClient(id: string, clientId: string): Promise<UploadRecord | null> {
    const rows = await this.sql`
      SELECT * FROM uploads WHERE id = ${id} AND client_id = ${clientId} AND deleted_at IS NULL
    `;
    if (rows.length === 0) return null;
    return rowToUploadRecord(rows[0] as Record<string, unknown>);
  }

  async markConsumed(id: string): Promise<void> {
    await this.sql`
      UPDATE uploads SET status = 'consumed', updated_at = NOW() WHERE id = ${id}
    `;
  }

  async deleteExpired(before: Date): Promise<number> {
    const rows = await this.sql`
      UPDATE uploads SET status = 'expired', deleted_at = NOW()
      WHERE expires_at < ${before} AND status = 'ready'
      RETURNING id
    `;
    return rows.length;
  }
}
