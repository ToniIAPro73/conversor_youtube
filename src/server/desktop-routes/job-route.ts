import { NextRequest, NextResponse } from "next/server";
import { jobManager } from "@/lib/jobs/job-manager";
import { ERROR_CODES, ERROR_MESSAGES } from "@/lib/errors";
import { updateJob } from "@/lib/infrastructure/db/job-repository";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const job = jobManager.getJob(jobId);

    if (!job) {
      return NextResponse.json(
        { error: ERROR_MESSAGES.JOB_NOT_FOUND, code: ERROR_CODES.JOB_NOT_FOUND },
        { status: 404 }
      );
    }

    const isAudio = ["mp3", "m4a", "wav", "flac", "ogg"].includes(job.output_format);
    const qualityLabel = isAudio
      ? `${job.quality} kbps`
      : `${job.quality}p`;

    const publicJob = {
      jobId: job.id,
      status: job.status,
      stage: job.stage,
      progress: job.progress,
      error: job.error_message,
      inputTitle: job.input_title,
      outputFormat: job.output_format,
      file:
        job.status === "completed"
          ? {
              name: job.output_file_name,
              mimeType: job.mime_type,
              sizeBytes: job.file_size_bytes,
              quality: qualityLabel,
              format: job.output_format,
            }
          : undefined,
      // Token is NOT returned here — must be fetched separately or embedded
      downloadAvailable: job.status === "completed" && !!job.download_token_hash,
    };

    return NextResponse.json(publicJob);
  } catch (error: unknown) {
    console.error("Job Status API Error:", error);
    return NextResponse.json(
      { error: ERROR_MESSAGES.INTERNAL_ERROR, code: ERROR_CODES.INTERNAL_ERROR },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const job = jobManager.getJob(jobId);

    if (!job) {
      return NextResponse.json(
        { error: ERROR_MESSAGES.JOB_NOT_FOUND, code: ERROR_CODES.JOB_NOT_FOUND },
        { status: 404 }
      );
    }

    const activeStatuses = ["queued", "downloading", "processing", "verifying"];
    if (activeStatuses.includes(job.status)) {
      updateJob(jobId, {
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        stage: "Cancelado",
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error("Cancel Job API Error:", error);
    return NextResponse.json(
      { error: ERROR_MESSAGES.INTERNAL_ERROR, code: ERROR_CODES.INTERNAL_ERROR },
      { status: 500 }
    );
  }
}
