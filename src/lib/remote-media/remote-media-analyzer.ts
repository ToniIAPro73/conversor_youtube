import { getVideoMetadata } from '../media/metadata';
import type { VideoFormat } from '../media/metadata';
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

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function analyzeRemoteMedia(url: string): Promise<RemoteMediaAnalysis> {
  const sourceUrlRedacted = redactSensitiveQueryParams(url);

  // Layer 1 — SSRF guard
  const guard = await validateRemoteUrl(url);
  if (!guard.safe) {
    return {
      sourceKind: 'unsupported-or-protected',
      sourceProvider: null,
      sourceUrlRedacted,
      isPubliclyAccessible: false,
      requiresAuthentication: false,
      drmDetected: false,
      extractorAvailable: false,
      analysisStatus: 'failed',
      videoVariants: [],
      audioVariants: [],
      limitationMessages: [guard.reason ?? 'URL bloqueada por seguridad'],
      alternativeMessage: null,
    };
  }

  // Layer 2 — Classify URL
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
        const msg = err instanceof Error ? err.message : String(err);
        return {
          sourceKind: 'youtube',
          sourceProvider: 'YouTube',
          sourceUrlRedacted,
          isPubliclyAccessible: false,
          requiresAuthentication: false,
          drmDetected: false,
          extractorAvailable: true,
          analysisStatus: 'failed',
          videoVariants: [],
          audioVariants: [],
          limitationMessages: [msg],
          alternativeMessage: null,
        };
      }
    }

    case 'direct-media': {
      const ext = url.split('.').pop()?.split('?')[0] ?? 'unknown';
      return {
        sourceKind: 'direct-media',
        sourceProvider: classification.sourceProvider,
        sourceUrlRedacted,
        isPubliclyAccessible: classification.isPubliclyAccessible,
        requiresAuthentication: classification.requiresAuthentication,
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
      return {
        sourceKind: classification.kind,
        sourceProvider: classification.sourceProvider,
        sourceUrlRedacted,
        isPubliclyAccessible: classification.isPubliclyAccessible,
        requiresAuthentication: classification.requiresAuthentication,
        drmDetected: classification.drmDetected,
        extractorAvailable: !classification.drmDetected,
        analysisStatus: classification.analysisStatus,
        videoVariants: [],
        audioVariants: [],
        limitationMessages: [],
        alternativeMessage: classification.drmDetected
          ? `Este stream ${kindLabel} está protegido con DRM. Anclora FileStudio no intenta eludir esas protecciones.`
          : `Stream ${kindLabel} detectado. Puede ser procesado si no contiene DRM.`,
      };
    }

    case 'web-page': {
      const pageResult = await analyzeWebPage(url);
      const limitations: string[] = [];
      if (pageResult.limitationMessage) limitations.push(pageResult.limitationMessage);
      if (pageResult.drmDetected) {
        limitations.push('Se detectaron indicios de DRM en la página.');
      }
      if (pageResult.requiresAuth) {
        limitations.push('La página parece requerir autenticación.');
      }

      const videoVariants = pageResult.sources
        .filter((s) => s.kind === 'direct')
        .map(mediaSourceToVideoFormat);

      return {
        sourceKind: 'web-page',
        sourceProvider: classification.sourceProvider,
        sourceUrlRedacted,
        isPubliclyAccessible: !pageResult.requiresAuth,
        requiresAuthentication: pageResult.requiresAuth,
        drmDetected: pageResult.drmDetected,
        extractorAvailable: pageResult.found && !pageResult.drmDetected,
        analysisStatus: pageResult.found ? 'resolved' : 'partial',
        videoVariants,
        audioVariants: [],
        limitationMessages: limitations,
        alternativeMessage: pageResult.found
          ? null
          : 'No se encontraron fuentes de vídeo directas en esta página.',
      };
    }

    case 'unsupported-or-protected':
    default: {
      return {
        sourceKind: 'unsupported-or-protected',
        sourceProvider: null,
        sourceUrlRedacted,
        isPubliclyAccessible: false,
        requiresAuthentication: true,
        drmDetected: false,
        extractorAvailable: false,
        analysisStatus: 'failed',
        videoVariants: [],
        audioVariants: [],
        limitationMessages: [classification.reason ?? 'Fuente no compatible'],
        alternativeMessage:
          'Este vídeo parece protegido, requiere acceso autenticado o no ofrece un stream compatible. Anclora FileStudio no intenta eludir esas protecciones.',
      };
    }
  }
}
