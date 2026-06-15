import { NextRequest, NextResponse } from "next/server";
import { jobManager } from "@/lib/jobs/job-manager";
import { ERROR_CODES, ERROR_MESSAGES } from "@/lib/errors";
import { CONFIG } from "@/lib/config";
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
    if (!absolutePath.startsWith(normalizedTemp + path.sep)) {
      return NextResponse.json(
        { error: "Acceso denegado.", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    if (!fs.existsSync(absolutePath)) {
      return NextResponse.json(
        { error: "El archivo ha expirado o no está disponible.", code: "ARTIFACT_EXPIRED" },
        { status: 410 }
      );
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
        "Content-Type": job.mime_type ?? "application/octet-stream",
        "Content-Length": job.file_size_bytes?.toString() ?? "",
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
