import { NextRequest, NextResponse } from "next/server";
import { normalizeYoutubeUrl } from "@/lib/youtube/normalize-url";
import { getVideoMetadata } from "@/lib/media/metadata";
import { MetadataRequestSchema } from "@/lib/youtube/schemas";
import { AppError, ERROR_CODES, ERROR_MESSAGES } from "@/lib/errors";
import { analyzeRemoteMedia } from "@/lib/remote-media/remote-media-analyzer";
import type { RemoteMediaAnalysis } from "@/lib/remote-media/remote-media-analyzer";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = MetadataRequestSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: ERROR_MESSAGES.INVALID_URL, code: ERROR_CODES.INVALID_URL },
        { status: 400 }
      );
    }

    const inputUrl = validated.data.url;
    const normalizedUrl = normalizeYoutubeUrl(inputUrl);

    if (normalizedUrl) {
      // YouTube path — use existing yt-dlp based flow
      const metadata = await getVideoMetadata(normalizedUrl);
      return NextResponse.json(metadata);
    }

    // Non-YouTube path — use the remote media analyzer (SSRF-protected)
    const remoteAnalysis: RemoteMediaAnalysis = await analyzeRemoteMedia(inputUrl);
    return NextResponse.json({ remoteAnalysis });
  } catch (error: unknown) {
    console.error("Metadata API Error:", error);
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    return NextResponse.json(
      { error: ERROR_MESSAGES.INTERNAL_ERROR, code: ERROR_CODES.INTERNAL_ERROR },
      { status: 500 }
    );
  }
}
