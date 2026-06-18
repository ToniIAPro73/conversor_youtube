import { NextRequest, NextResponse } from "next/server";
import { loadDesktopModule } from "@/app/api/_desktop-route-loader";
import type { UniversalFileDescriptor } from "@/lib/domain/descriptors";
import type { CapabilityInfo } from "@/lib/domain/unified-analysis";
import { normalizeCapabilityInfo } from "@/lib/domain/unified-analysis";
import type { ConversionCapability } from "@/lib/domain/engines";
import { getWebCapabilitiesForExtension } from "@/lib/browser-conversion";
import { isVercelWeb } from "@/lib/deployment-target";
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

type LegacyConversionCapability = {
  outputFormat: string;
  operation: string;
  enabled: boolean;
  warning?: string;
  reason?: string;
};

async function checkToolAvailability() {
  const fsModule = "fs";
  const configModule = "@/lib/config";
  const [fs, { CONFIG }] = await Promise.all([
    loadDesktopModule<typeof import("fs")>(fsModule),
    loadDesktopModule<typeof import("@/lib/config")>(configModule),
  ]);
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

export async function GET() {
  if (isVercelWeb()) {
    return NextResponse.json({
      deploymentTarget: "vercel",
      effectivePlatform: "vercel-web",
      categories: {
        browser: ["json", "yaml", "toml", "xml", "csv", "tsv"],
        "desktop-required": [
          "audio",
          "video",
          "image",
          "document",
          "spreadsheet",
          "presentation",
          "pdf",
          "ebook",
          "archive",
          "ocr",
        ],
        "future-service": [],
        unavailable: [],
      },
      serverConversions: false,
      cloudUploads: false,
    });
  }

  return NextResponse.json({
    deploymentTarget: "desktop",
    message: "Use POST with an analyzed descriptor to compute Desktop capabilities.",
  });
}

/**
 * Convert a legacy media ConversionCapability to a normalized CapabilityInfo
 */
function mediaCapToCapabilityInfo(
  cap: LegacyConversionCapability,
  engineId: import("@/lib/domain/engines").EngineId = "ffmpeg-media"
): CapabilityInfo {
  const isAudioFormat = ["mp3", "m4a", "wav", "flac", "ogg"].includes(cap.outputFormat as string);
  const mobilePortability: import("@/lib/domain/engines").MobilePortability =
    isAudioFormat ? "portable-domain" : "replace-adapter-on-mobile";

  let lossProfile: import("@/lib/domain/unified-analysis").CapabilityLossProfile = "lossy";
  if (cap.operation === "remux") lossProfile = "lossless";
  if (cap.operation === "extract-audio") lossProfile = "lossy";
  if (cap.operation === "normalize-audio") lossProfile = "metadata-risk";
  if (cap.operation === "extract-thumbnail") lossProfile = "lossy";
  if (cap.operation === "extract-subtitles") lossProfile = "lossless";
  if (cap.operation === "create-gif") lossProfile = "lossy";

  const state: import("@/lib/domain/unified-analysis").CapabilityState =
    cap.enabled ? "available" : "unavailable-tool";

  const warnings: string[] = [];
  if (cap.warning) warnings.push(cap.warning);
  if (cap.reason) warnings.push(cap.reason);

  return {
    id: `ffmpeg-${cap.operation}-${cap.outputFormat}`,
    outputFormat: cap.outputFormat as string,
    outputLabel: cap.outputFormat.toUpperCase(),
    state,
    lossProfile,
    engineId,
    mobilePortability,
    warnings,
  };
}

/**
 * Convert a universal engine ConversionCapability to a normalized CapabilityInfo
 */
function universalCapToCapabilityInfo(cap: ConversionCapability): CapabilityInfo {
  return normalizeCapabilityInfo({
    id: cap.id,
    outputFormat: cap.outputFormat,
    label: cap.label,
    outputLabel: cap.label,
    lossProfile: cap.lossProfile === "none" ? "lossless" :
      (cap.lossProfile as import("@/lib/domain/unified-analysis").CapabilityLossProfile),
    engineId: cap.engineId,
    mobilePortability: cap.mobilePortability,
    warnings: cap.warnings,
    unavailableReason: cap.unavailableReason,
    state: cap.state === "available" ? "available" :
      cap.state === "unsupported-input" ? "unsupported" :
      cap.state === "unsafe" ? "unsupported" :
      cap.state === "experimental" ? "available" :
      "unavailable-tool",
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Falta el descriptor. Envía 'descriptor' (media) o 'universalDescriptor' (universal).", code: "INVALID_INPUT" }, { status: 400 });
    }

    // Universal path — new engines (Sharp, data, qpdf, 7-Zip, pandoc, LibreOffice)
    if ("universalDescriptor" in parsed.data) {
      const descriptor = parsed.data.universalDescriptor as unknown as UniversalFileDescriptor;
      if (isVercelWeb()) {
        const normalizedCaps = getWebCapabilitiesForExtension(
          descriptor.detectedFormat ?? descriptor.extension ?? ""
        );
        const recommended = normalizedCaps.find((cap) => cap.state === "available") ?? null;
        return NextResponse.json({
          capabilities: normalizedCaps,
          recommended,
          inputFormat: descriptor.detectedFormat ?? descriptor.extension ?? "unknown",
          inputCategory: descriptor.category,
          deploymentTarget: "vercel",
        });
      }

      const registryModule = "@/lib/engines/registry";
      const { getCapabilities } = await loadDesktopModule<typeof import("@/lib/engines/registry")>(registryModule);
      const capabilities = await getCapabilities(descriptor);

      // Normalize to CapabilityInfo
      const normalizedCaps: CapabilityInfo[] = capabilities.map(universalCapToCapabilityInfo);

      const recommended = normalizedCaps.find((c) => c.state === "available" && capabilities.find(ec => ec.id === c.id)?.recommended) ?? null;

      return NextResponse.json({
        capabilities: normalizedCaps,
        recommended,
        inputFormat: descriptor.detectedFormat ?? descriptor.extension ?? "unknown",
        inputCategory: descriptor.category,
      });
    }

    // Legacy media path — FFmpeg engine
    if (isVercelWeb()) {
      return NextResponse.json({
        capabilities: [],
        recommended: null,
        inputFormat: "unknown",
        inputCategory: "desktop-required",
        deploymentTarget: "vercel",
      });
    }

    const mediaModule = "@/lib/media/supported-conversions";
    const { getSupportedConversions, getRecommendedConversion } =
      await loadDesktopModule<typeof import("@/lib/media/supported-conversions")>(mediaModule);
    type MediaDescriptor = import("@/lib/media/probe").MediaDescriptor;
    const descriptor = parsed.data.descriptor as unknown as MediaDescriptor;
    const tools = await checkToolAvailability();
    const capabilities = getSupportedConversions(descriptor, tools);
    const recommended = getRecommendedConversion(descriptor, capabilities);

    // Normalize to CapabilityInfo
    const normalizedCaps: CapabilityInfo[] = capabilities.map((cap) => mediaCapToCapabilityInfo(cap));

    const recommendedCapInfo = recommended
      ? mediaCapToCapabilityInfo(recommended)
      : null;

    return NextResponse.json({
      capabilities: normalizedCaps,
      recommended: recommendedCapInfo,
      inputFormat: descriptor.container ?? "unknown",
      inputCategory: (descriptor.hasVideo ? "video" : "audio") as string,
    });
  } catch (error: unknown) {
    console.error("Capabilities API error:", error);
    return NextResponse.json({ error: "Error calculando capacidades.", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
