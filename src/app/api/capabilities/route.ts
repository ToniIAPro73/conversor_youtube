import { NextRequest, NextResponse } from "next/server";
import { getSupportedConversions, getRecommendedConversion } from "@/lib/media/supported-conversions";
import { MediaDescriptor } from "@/lib/media/probe";
import { getCapabilities } from "@/lib/engines/registry";
import type { UniversalFileDescriptor } from "@/lib/domain/descriptors";
import fs from "fs";
import { CONFIG } from "@/lib/config";
import { z } from "zod";

const BodySchema = z.union([
  // Legacy media descriptor (YouTube + local media files)
  z.object({
    descriptor: z.object({}).passthrough(),
  }),
  // Universal descriptor (images, PDF, archives, data)
  z.object({
    universalDescriptor: z.object({}).passthrough(),
  }),
]);

function checkToolAvailability() {
  function exists(bin: string) {
    if (!bin.includes("/") && !bin.includes("\\")) return true;
    return fs.existsSync(bin);
  }
  return {
    ffmpeg: exists(CONFIG.media.binaries.ffmpeg),
    ffprobe: exists(CONFIG.media.binaries.ffprobe),
    ytdlp: exists(CONFIG.media.binaries.ytdlp),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Falta el descriptor. Envía 'descriptor' (media) o 'universalDescriptor' (universal).", code: "INVALID_INPUT" }, { status: 400 });
    }

    // Universal path — new engines (Sharp, data, qpdf, 7-Zip)
    if ("universalDescriptor" in parsed.data) {
      const descriptor = parsed.data.universalDescriptor as unknown as UniversalFileDescriptor;
      const capabilities = await getCapabilities(descriptor);

      return NextResponse.json({
        path: "universal",
        category: descriptor.category,
        capabilities,
        recommended: capabilities.find((c) => c.recommended) ?? null,
      });
    }

    // Legacy media path — FFmpeg engine
    const descriptor = parsed.data.descriptor as unknown as MediaDescriptor;
    const tools = checkToolAvailability();
    const capabilities = getSupportedConversions(descriptor, tools);
    const recommended = getRecommendedConversion(descriptor, capabilities);

    return NextResponse.json({
      path: "media",
      input: {
        hasAudio: descriptor.hasAudio,
        hasVideo: descriptor.hasVideo,
        hasSubtitles: descriptor.hasSubtitles,
        durationSeconds: descriptor.durationSeconds,
        container: descriptor.container,
        audioStreams: descriptor.audioStreams?.length ?? 0,
        videoStreams: descriptor.videoStreams?.length ?? 0,
      },
      recommended: recommended
        ? {
            operation: recommended.operation,
            format: recommended.outputFormat,
            preset: recommended.presets[0]?.id ?? null,
          }
        : null,
      capabilities,
      tools,
    });
  } catch (error: unknown) {
    console.error("Capabilities API error:", error);
    return NextResponse.json({ error: "Error calculando capacidades.", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
