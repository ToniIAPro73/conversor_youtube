import { NextRequest, NextResponse } from "next/server";
import { normalizeYoutubeUrl } from "@/lib/youtube/normalize-url";
import { getVideoMetadata } from "@/lib/media/metadata";
import { MetadataRequestSchema } from "@/lib/youtube/schemas";
import { AppError, ERROR_CODES, ERROR_MESSAGES } from "@/lib/errors";

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

    const normalizedUrl = normalizeYoutubeUrl(validated.data.url);
    if (!normalizedUrl) {
      return NextResponse.json(
        { error: ERROR_MESSAGES.INVALID_URL, code: ERROR_CODES.INVALID_URL },
        { status: 400 }
      );
    }

    const metadata = await getVideoMetadata(normalizedUrl);
    return NextResponse.json(metadata);
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
