import { NextRequest, NextResponse } from "next/server";
import { jobManager } from "@/lib/jobs/job-manager";
import { ERROR_CODES, ERROR_MESSAGES } from "@/lib/errors";
import { CONFIG } from "@/lib/config";
import { FORMAT_BY_EXTENSION } from "@/lib/domain/format-catalog";
import { getDb } from "@/lib/infrastructure/db/database";
import crypto from "crypto";
import path from "path";
import fs from "fs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");
    const singleUse = searchParams.get("singleUse") === "true";

    const job = jobManager.getJob(jobId);

    if (!job || job.status !== "completed") {
      return NextResponse.json(
        { error: ERROR_MESSAGES.JOB_NOT_FOUND, code: ERROR_CODES.JOB_NOT_FOUND },
        { status: 404 }
      );
    }

    if (!token || !job.download_token_hash) {
      return NextResponse.json(
        { error: ERROR_MESSAGES.DOWNLOAD_TOKEN_INVALID, code: ERROR_CODES.DOWNLOAD_TOKEN_INVALID },
        { status: 403 }
      );
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    if (tokenHash !== job.download_token_hash) {
      return NextResponse.json(
        { error: ERROR_MESSAGES.DOWNLOAD_TOKEN_INVALID, code: ERROR_CODES.DOWNLOAD_TOKEN_INVALID },
        { status: 403 }
      );
    }

    if (!job.output_relative_path) {
      return NextResponse.json(
        { error: ERROR_MESSAGES.INTERNAL_ERROR, code: ERROR_CODES.INTERNAL_ERROR },
        { status: 500 }
      );
    }

    // Resolve absolute path safely
    const absolutePath = path.resolve(CONFIG.media.tempDir, job.output_relative_path);
    const normalizedTemp = path.resolve(CONFIG.media.tempDir);

    // Security: verify the artifact path is inside the temp dir
    if (!absolutePath.startsWith(normalizedTemp + path.sep)) {
      return NextResponse.json(
        { error: "Acceso denegado.", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    // Security: verify the artifact path belongs to this specific job
    // The output_relative_path should start with the job's ID directory
    const jobDir = path.join(normalizedTemp, jobId);
    const isInJobDir = absolutePath.startsWith(jobDir + path.sep) || absolutePath === path.join(jobDir, path.basename(absolutePath));
    // Also allow the artifact to be directly in the job dir (standard pattern)
    if (!isInJobDir) {
      // For legacy jobs where output might be at a different relative path
      // still enforce that it's within the temp dir (already checked above)
      // but log a warning
      console.warn(`[download] Artifact path ${absolutePath} is not within job dir ${jobDir}`);
    }

    if (!fs.existsSync(absolutePath)) {
      return NextResponse.json(
        { error: "El archivo ha expirado o no está disponible.", code: "ARTIFACT_EXPIRED" },
        { status: 410 }
      );
    }

    // Determine correct MIME type from format catalog instead of relying solely on stored MIME
    const outputFormat = job.output_format;
    const catalogMime = outputFormat ? FORMAT_BY_EXTENSION.get(outputFormat)?.mimeTypes[0] : undefined;
    const contentType = catalogMime ?? job.output_mime_type ?? job.mime_type ?? "application/octet-stream";

    // Get file size for Content-Length
    const fileStat = fs.statSync(absolutePath);
    const contentLength = job.file_size_bytes ?? fileStat.size;

    // Invalidate token if single-use requested
    if (singleUse) {
      try {
        const db = getDb();
        db.prepare("UPDATE jobs SET download_token_hash = NULL, updated_at = datetime('now') WHERE id = ?").run(jobId);
      } catch (err) {
        console.error("[download] Failed to invalidate single-use token:", err);
        // Continue with the download even if token invalidation fails
      }
    }

    const fileStream = fs.createReadStream(absolutePath);
    const readable = new ReadableStream({
      start(controller) {
        fileStream.on("data", (chunk) => controller.enqueue(chunk));
        fileStream.on("end", () => controller.close());
        fileStream.on("error", (err) => controller.error(err));
      },
      cancel() {
        fileStream.destroy();
      },
    });

    const fileName = job.output_file_name ?? `download.${job.output_format}`;

    return new NextResponse(readable, {
      headers: {
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
        "Content-Type": contentType,
        "Content-Length": contentLength.toString(),
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error: unknown) {
    console.error("Download API Error:", error);
    return NextResponse.json(
      { error: ERROR_MESSAGES.INTERNAL_ERROR, code: ERROR_CODES.INTERNAL_ERROR },
      { status: 500 }
    );
  }
}
