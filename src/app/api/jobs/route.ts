import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { jobManager } from "@/lib/jobs/job-manager";
import { processJob } from "@/lib/media/processor";
import { CONFIG } from "@/lib/config";
import { ERROR_CODES, ERROR_MESSAGES } from "@/lib/errors";
import { normalizeYoutubeUrl } from "@/lib/youtube/normalize-url";
import { getVideoMetadata } from "@/lib/media/metadata";

const AUDIO_FORMATS = ["mp3", "m4a", "wav", "flac", "ogg"] as const;
const VIDEO_FORMATS = ["mp4", "webm", "mkv"] as const;
const ALL_FORMATS = [...AUDIO_FORMATS, ...VIDEO_FORMATS] as const;

const JobRequestSchema = z.object({
  videoId: z.string().optional(),
  url: z.string().optional(),
  localFilePath: z.string().optional(),
  format: z.enum(ALL_FORMATS),
  quality: z.string().min(1).max(10),
  rightsConfirmed: z.boolean(),
  operation: z.string().default("transcode-audio"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = JobRequestSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.issues[0].message, code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    if (!validated.data.rightsConfirmed) {
      return NextResponse.json(
        { error: "Debes confirmar que tienes derechos sobre el contenido.", code: "RIGHTS_NOT_CONFIRMED" },
        { status: 400 }
      );
    }

    const clientIp = req.headers.get("x-forwarded-for") ?? "127.0.0.1";

    if (jobManager.getActiveJobsCount() >= CONFIG.media.limits.maxConcurrentJobs) {
      return NextResponse.json(
        { error: ERROR_MESSAGES.QUEUE_FULL, code: ERROR_CODES.QUEUE_FULL },
        { status: 503 }
      );
    }

    if (jobManager.getClientActiveJob(clientIp)) {
      return NextResponse.json(
        { error: ERROR_MESSAGES.JOB_ALREADY_ACTIVE, code: ERROR_CODES.JOB_ALREADY_ACTIVE },
        { status: 429 }
      );
    }

    const data = validated.data;
    let inputReference: string;
    let inputTitle: string | undefined;
    const inputKind: "remote-url" | "local-file" = data.localFilePath ? "local-file" : "remote-url";

    if (inputKind === "local-file") {
      if (!data.localFilePath) {
        return NextResponse.json({ error: "Falta ruta del archivo local.", code: "INVALID_INPUT" }, { status: 400 });
      }
      inputReference = data.localFilePath;
    } else {
      const rawUrl = data.url ?? (data.videoId ? `https://www.youtube.com/watch?v=${data.videoId}` : null);
      if (!rawUrl) {
        return NextResponse.json({ error: "Falta URL o videoId.", code: "INVALID_INPUT" }, { status: 400 });
      }
      const normalizedUrl = normalizeYoutubeUrl(rawUrl);
      if (!normalizedUrl) {
        return NextResponse.json(
          { error: ERROR_MESSAGES.INVALID_URL, code: ERROR_CODES.INVALID_URL },
          { status: 400 }
        );
      }
      inputReference = normalizedUrl;

      try {
        const meta = await getVideoMetadata(normalizedUrl);
        inputTitle = meta.title;
      } catch {
        // Non-fatal
      }
    }

    const operation =
      data.operation !== "transcode-audio"
        ? data.operation
        : AUDIO_FORMATS.includes(data.format as (typeof AUDIO_FORMATS)[number])
        ? "transcode-audio"
        : "transcode-video";

    const job = jobManager.createJob(
      inputReference,
      data.format,
      data.quality,
      clientIp,
      operation,
      inputKind,
      inputTitle
    );

    processJob(job.id).catch(console.error);

    return NextResponse.json({ jobId: job.id, status: job.status });
  } catch (error: unknown) {
    console.error("Jobs API Error:", error);
    return NextResponse.json(
      { error: ERROR_MESSAGES.INTERNAL_ERROR, code: ERROR_CODES.INTERNAL_ERROR },
      { status: 500 }
    );
  }
}
