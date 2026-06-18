import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/infrastructure/db/job-repository";
import { getDb } from "@/lib/infrastructure/db/database";
import { ERROR_CODES, ERROR_MESSAGES } from "@/lib/errors";
import crypto from "crypto";

/**
 * GET /api/jobs/:jobId/token
 * Returns a short-lived, single-use download token for a completed job.
 * The actual token value is derived from the stored hash only when requested.
 * We store a NEW one-time token on each call (rotating).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const job = getJob(jobId);

    if (!job || job.status !== "completed") {
      return NextResponse.json(
        { error: ERROR_MESSAGES.JOB_NOT_FOUND, code: ERROR_CODES.JOB_NOT_FOUND },
        { status: 404 }
      );
    }

    if (!job.download_token_hash) {
      return NextResponse.json(
        { error: "Token no disponible.", code: "TOKEN_UNAVAILABLE" },
        { status: 404 }
      );
    }

    // Issue a new short-lived token that is valid for 15 minutes
    const token = crypto.randomBytes(32).toString("hex");
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // Store the new hash (replaces previous one-time token)
    const db = getDb();
    db.prepare(
      "UPDATE jobs SET download_token_hash = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(hash, jobId);

    return NextResponse.json({
      token,
      expiresAt,
      downloadUrl: `/api/download/${jobId}?token=${token}`,
    });
  } catch (error: unknown) {
    console.error("Token API error:", error);
    return NextResponse.json(
      { error: ERROR_MESSAGES.INTERNAL_ERROR, code: ERROR_CODES.INTERNAL_ERROR },
      { status: 500 }
    );
  }
}
