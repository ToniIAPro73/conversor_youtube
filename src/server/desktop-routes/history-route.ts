import { NextResponse } from "next/server";
import { listJobs } from "@/lib/infrastructure/db/job-repository";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const jobs = listJobs(50);
    const publicJobs = jobs.map((j) => ({
      id: j.id,
      inputTitle: j.input_title,
      inputKind: j.input_kind,
      operation: j.operation,
      outputFormat: j.output_format,
      quality: j.quality,
      status: j.status,
      stage: j.stage,
      progress: j.progress,
      errorMessage: j.error_message,
      fileSizeBytes: j.file_size_bytes,
      mimeType: j.mime_type,
      outputFileName: j.output_file_name,
      downloadAvailable: j.status === "completed" && !!j.download_token_hash,
      createdAt: j.created_at,
      completedAt: j.completed_at,
      expiresAt: j.expires_at,
      // Universal fields
      category: j.category,
      engineId: j.engine_id,
      lossProfile: j.loss_profile,
      conversionId: j.conversion_id,
    }));

    return NextResponse.json({ jobs: publicJobs });
  } catch (error: unknown) {
    console.error("History API error:", error);
    return NextResponse.json({ error: "Error obteniendo historial.", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
