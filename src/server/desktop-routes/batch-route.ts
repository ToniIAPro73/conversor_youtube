import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createBatch, getBatchStatus, cancelBatch } from "@/lib/jobs/batch-processor";

// ── Schemas ──────────────────────────────────────────────────────────────────

const CreateBatchSchema = z.object({
  files: z.array(z.string().min(1)).min(1, "At least one file is required"),
  capabilityId: z.string().min(1),
  options: z.record(z.string(), z.unknown()).default({}),
  name: z.string().optional(),
  concurrency: z.number().int().min(1).max(10).optional(),
});

// ── POST: Create a new batch ─────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = CreateBatchSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.issues[0]?.message ?? "Validation error", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const clientIp = req.headers.get("x-forwarded-for") ?? "127.0.0.1";

    const batch = await createBatch({
      files: validated.data.files,
      capabilityId: validated.data.capabilityId,
      options: validated.data.options,
      name: validated.data.name,
      clientIp,
      concurrency: validated.data.concurrency,
    });

    return NextResponse.json({
      batchId: batch.id,
      status: batch.status,
      totalJobs: batch.totalJobs,
    }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error creating batch";
    const code = (error as { code?: string })?.code ?? "BATCH_ERROR";

    console.error("[batch-api] POST error:", message);

    // Map known error codes to HTTP status
    const statusMap: Record<string, number> = {
      ENGINE_NOT_FOUND: 400,
      ENGINE_UNAVAILABLE: 503,
      INVALID_STATE: 400,
    };

    const httpStatus = statusMap[code] ?? 500;
    return NextResponse.json({ error: message, code }, { status: httpStatus });
  }
}

// ── GET: Get batch status ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const GetBatchQuerySchema = z.object({
  batchId: z.string().min(1),
  action: z.enum(["status", "cancel"]).optional().default("status"),
});

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const batchId = url.searchParams.get("batchId");
    const action = url.searchParams.get("action") ?? "status";

    if (!batchId) {
      return NextResponse.json(
        { error: "batchId query parameter is required", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    // Handle cancel action
    if (action === "cancel") {
      const result = cancelBatch(batchId);
      if (!result) {
        return NextResponse.json(
          { error: "Batch not found", code: "BATCH_NOT_FOUND" },
          { status: 404 }
        );
      }
      return NextResponse.json(result);
    }

    // Default: return status
    const batch = getBatchStatus(batchId);
    if (!batch) {
      return NextResponse.json(
        { error: "Batch not found", code: "BATCH_NOT_FOUND" },
        { status: 404 }
      );
    }

    return NextResponse.json(batch);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error fetching batch";
    console.error("[batch-api] GET error:", message);
    return NextResponse.json({ error: message, code: "BATCH_ERROR" }, { status: 500 });
  }
}
