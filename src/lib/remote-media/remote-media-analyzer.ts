import { getVideoMetadata } from '../media/metadata';
import type { VideoFormat } from '../media/metadata';
import { AppError } from '../errors';
import { validateRemoteUrl, redactSensitiveQueryParams } from './ssrf-guard';
import { classifyRemoteUrl } from './url-classifier';
import type { SourceKind } from './url-classifier';
import { analyzeWebPage } from './web-page-analyzer';
import type { MediaSource } from './web-page-analyzer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { SourceKind };

export interface AudioVariant {
  formatId: string;
  ext: string;
  acodec: string | null;
  abr: number | null;
  fileSizeBytes: number | null;
}

export interface RemoteMediaAnalysis {
  sourceKind: SourceKind;
  sourceProvider: string | null;
  sourceUrlRedacted: string;
  /** True ONLY when validateRemoteUrl() blocks the URL (SSRF / private network). */
  ssrfBlocked: boolean;
  isPubliclyAccessible: boolean;
  requiresAuthentication: boolean;
  drmDetected: boolean;
  extractorAvailable: boolean;
  analysisStatus: string;
  videoVariants: VideoFormat[];
  audioVariants: AudioVariant[];
  limitationMessages: string[];
  alternativeMessage: string | null;
  title?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  durationLabel?: string;
  /**
   * When both yt-dlp and HTML analysis failed, stores the classified error so
   * the route can forward it directly instead of returning a generic message.
   */
  classifiedError?: { code: string; message: string; status: number };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mediaSourceToVideoFormat(src: MediaSource, index: number): VideoFormat {
  return {
    formatId: `remote-${index}`,
    width: null,
    height: null,
    fps: null,
    ext: src.url.split('.').pop()?.split('?')[0] ?? src.mimeType?.split('/')[1] ?? 'unknown',
    vcodec: null,
    acodec: null,
    isVideoOnly: false,
    fileSizeBytes: null,
    fileSizeApproxBytes: null,
    tbr: null,
  };
}

const EMPTY_SSRF_BLOCK = (sourceUrlRedacted: string, reason: string): RemoteMediaAnalysis => ({
  sourceKind: 'unsupported-or-protected',
  sourceProvider: null,
  sourceUrlRedacted,
  ssrfBlocked: true,
  isPubliclyAccessible: false,
  requiresAuthentication: false,
  drmDetected: false,
  extractorAvailable: false,
  analysisStatus: 'failed',
  videoVariants: [],
  audioVariants: [],
  limitationMessages: [reason],
  alternativeMessage: null,
});

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function analyzeRemoteMedia(url: string): Promise<RemoteMediaAnalysis> {
  const sourceUrlRedacted = redactSensitiveQueryParams(url);

  // Layer 1 — SSRF guard (network security requirement; hard block)
  const guard = await validateRemoteUrl(url);
  if (!guard.safe) {
    return EMPTY_SSRF_BLOCK(sourceUrlRedacted, guard.reason ?? 'URL bloqueada por seguridad de red.');
  }

  // Layer 2 — Classify URL by extension / Content-Type / host
  const classification = await classifyRemoteUrl(url);

  // Layer 3 — Dispatch by kind
  switch (classification.kind) {
    case 'youtube': {
      try {
        const meta = await getVideoMetadata(url);
        return {
          sourceKind: 'youtube',
          sourceProvider: 'YouTube',
          sourceUrlRedacted,
          ssrfBlocked: false,
          isPubliclyAccessible: true,
          requiresAuthentication: false,
          drmDetected: false,
          extractorAvailable: true,
          analysisStatus: 'resolved',
          videoVariants: meta.videoFormats,
          audioVariants: [],
          limitationMessages: [],
          alternativeMessage: null,
          title: meta.title,
          thumbnailUrl: meta.thumbnailUrl,
          durationSeconds: meta.durationSeconds,
          durationLabel: meta.durationLabel,
        };
      } catch (err) {
        const appErr = err instanceof AppError ? err : null;
        return {
          sourceKind: 'youtube',
          sourceProvider: 'YouTube',
          sourceUrlRedacted,
          ssrfBlocked: false,
          isPubliclyAccessible: false,
          requiresAuthentication: false,
          drmDetected: false,
          extractorAvailable: true,
          analysisStatus: 'failed',
          videoVariants: [],
          audioVariants: [],
          limitationMessages: [appErr?.message ?? (err instanceof Error ? err.message : String(err))],
          alternativeMessage: null,
          classifiedError: appErr
            ? { code: appErr.code, message: appErr.message, status: appErr.status ?? 500 }
            : undefined,
        };
      }
    }

    case 'direct-media': {
      const ext = url.split('.').pop()?.split('?')[0] ?? 'unknown';
      return {
        sourceKind: 'direct-media',
        sourceProvider: classification.sourceProvider,
        sourceUrlRedacted,
        ssrfBlocked: false,
        isPubliclyAccessible: true,
        requiresAuthentication: false,
        drmDetected: false,
        extractorAvailable: true,
        analysisStatus: 'resolved',
        videoVariants: [
          {
            formatId: 'direct-0',
            width: null,
            height: null,
            fps: null,
            ext,
            vcodec: null,
            acodec: null,
            isVideoOnly: false,
            fileSizeBytes: null,
            fileSizeApproxBytes: null,
            tbr: null,
          },
        ],
        audioVariants: [],
        limitationMessages: [],
        alternativeMessage: null,
      };
    }

    case 'hls':
    case 'dash': {
      const kindLabel = classification.kind === 'hls' ? 'HLS' : 'DASH';
      // For DRM streams, yt-dlp will also fail — let it try and report the real error.
      // Here we return the detected stream type without blocking.
      return {
        sourceKind: classification.kind,
        sourceProvider: classification.sourceProvider,
        sourceUrlRedacted,
        ssrfBlocked: false,
        isPubliclyAccessible: true,
        requiresAuthentication: false,
        drmDetected: classification.drmDetected,
        extractorAvailable: true,
        analysisStatus: 'resolved',
        videoVariants: [],
        audioVariants: [],
        limitationMessages: [],
        alternativeMessage: classification.drmDetected
          ? `Stream ${kindLabel} protegido con DRM detectado. Anclora FileStudio no puede procesar contenido DRM.`
          : null,
      };
    }

    case 'web-page': {
      // Strategy: try yt-dlp first (supports hundreds of sites), then fall back
      // to HTML source extraction for simple pages with <video>/<source> tags.
      // Auth/DRM heuristics from HTML are NOT used as blocking signals.

      let ytdlpError: AppError | null = null;

      try {
        const meta = await getVideoMetadata(url);
        return {
          sourceKind: 'web-page',
          sourceProvider: classification.sourceProvider,
          sourceUrlRedacted,
          ssrfBlocked: false,
          isPubliclyAccessible: true,
          requiresAuthentication: false,
          drmDetected: false,
          extractorAvailable: true,
          analysisStatus: 'resolved',
          videoVariants: meta.videoFormats,
          audioVariants: [],
          limitationMessages: [],
          alternativeMessage: null,
          title: meta.title,
          thumbnailUrl: meta.thumbnailUrl,
          durationSeconds: meta.durationSeconds,
          durationLabel: meta.durationLabel,
        };
      } catch (err) {
        ytdlpError = err instanceof AppError ? err : new AppError('INTERNAL_ERROR', err instanceof Error ? err.message : String(err), 500);
      }

      // yt-dlp failed — try HTML analysis for simple pages with direct video elements
      const pageResult = await analyzeWebPage(url);
      const videoVariants = pageResult.sources
        .filter((s) => s.kind === 'direct')
        .map(mediaSourceToVideoFormat);

      if (videoVariants.length > 0) {
        // HTML found direct sources; return them (ignore auth/DRM heuristics)
        return {
          sourceKind: 'web-page',
          sourceProvider: classification.sourceProvider,
          sourceUrlRedacted,
          ssrfBlocked: false,
          isPubliclyAccessible: true,
          requiresAuthentication: false,
          drmDetected: false,
          extractorAvailable: true,
          analysisStatus: 'partial',
          videoVariants,
          audioVariants: [],
          limitationMessages: pageResult.limitationMessage ? [pageResult.limitationMessage] : [],
          alternativeMessage: null,
        };
      }

      // Both failed — propagate the classified yt-dlp error
      return {
        sourceKind: 'web-page',
        sourceProvider: classification.sourceProvider,
        sourceUrlRedacted,
        ssrfBlocked: false,
        isPubliclyAccessible: false,
        requiresAuthentication: false,
        drmDetected: false,
        extractorAvailable: false,
        analysisStatus: 'failed',
        videoVariants: [],
        audioVariants: [],
        limitationMessages: [ytdlpError.message],
        alternativeMessage: null,
        classifiedError: {
          code: ytdlpError.code,
          message: ytdlpError.message,
          status: ytdlpError.status ?? 500,
        },
      };
    }

    case 'unsupported-or-protected':
    default: {
      // Try yt-dlp anyway — it supports many sites that look "unsupported"
      // by extension/content-type alone (Vimeo, Twitter, TikTok, etc.)
      try {
        const meta = await getVideoMetadata(url);
        return {
          sourceKind: 'unsupported-or-protected',
          sourceProvider: null,
          sourceUrlRedacted,
          ssrfBlocked: false,
          isPubliclyAccessible: true,
          requiresAuthentication: false,
          drmDetected: false,
          extractorAvailable: true,
          analysisStatus: 'resolved',
          videoVariants: meta.videoFormats,
          audioVariants: [],
          limitationMessages: [],
          alternativeMessage: null,
          title: meta.title,
          thumbnailUrl: meta.thumbnailUrl,
          durationSeconds: meta.durationSeconds,
          durationLabel: meta.durationLabel,
        };
      } catch (err) {
        const appErr = err instanceof AppError ? err : new AppError('INTERNAL_ERROR', err instanceof Error ? err.message : String(err), 500);
        return {
          sourceKind: 'unsupported-or-protected',
          sourceProvider: null,
          sourceUrlRedacted,
          ssrfBlocked: false,
          isPubliclyAccessible: false,
          requiresAuthentication: false,
          drmDetected: false,
          extractorAvailable: false,
          analysisStatus: 'failed',
          videoVariants: [],
          audioVariants: [],
          limitationMessages: [appErr.message],
          alternativeMessage: null,
          classifiedError: {
            code: appErr.code,
            message: appErr.message,
            status: appErr.status ?? 500,
          },
        };
      }
    }
  }
}
