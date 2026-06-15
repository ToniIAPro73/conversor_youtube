import { MediaDescriptor } from "./probe";
import { ConversionOperation, AudioOutputFormat, VideoOutputFormat } from "../jobs/job-types";

export interface ConversionPreset {
  id: string;
  label: string;
  quality: string;
  description: string;
}

export interface ConversionCapability {
  operation: ConversionOperation;
  outputFormat: AudioOutputFormat | VideoOutputFormat | string;
  enabled: boolean;
  recommended: boolean;
  reason?: string;
  warning?: string;
  presets: ConversionPreset[];
}

interface ToolCapabilities {
  ffmpeg: boolean;
  ffprobe: boolean;
  ytdlp: boolean;
}

const AUDIO_PRESETS: Record<AudioOutputFormat, ConversionPreset[]> = {
  mp3: [
    { id: "mp3-voice", label: "Voz / Podcast", quality: "96", description: "96 kbps — tamaño reducido, bueno para voz" },
    { id: "mp3-balanced", label: "Compartir (recomendado)", quality: "192", description: "192 kbps — equilibrio calidad/tamaño" },
    { id: "mp3-high", label: "Alta calidad", quality: "320", description: "320 kbps — máxima calidad MP3" },
  ],
  m4a: [
    { id: "m4a-balanced", label: "Equilibrado", quality: "128", description: "128 kbps AAC — compatible con Apple" },
    { id: "m4a-high", label: "Alta calidad", quality: "256", description: "256 kbps AAC — buena calidad con tamaño moderado" },
  ],
  wav: [
    { id: "wav-standard", label: "WAV estándar", quality: "0", description: "Sin compresión — ideal para edición" },
  ],
  flac: [
    { id: "flac-lossless", label: "Sin pérdida", quality: "0", description: "Compresión sin pérdida — archivado de máxima calidad" },
  ],
  ogg: [
    { id: "ogg-balanced", label: "Equilibrado", quality: "4", description: "Calidad OGG q4 — buena relación calidad/tamaño" },
    { id: "ogg-high", label: "Alta calidad", quality: "8", description: "Calidad OGG q8 — máxima calidad Vorbis" },
  ],
};

const VIDEO_PRESETS: Record<VideoOutputFormat, ConversionPreset[]> = {
  mp4: [
    { id: "mp4-480p", label: "Web ligero (480p)", quality: "480", description: "H.264 480p — compatible y ligero" },
    { id: "mp4-720p", label: "HD (720p)", quality: "720", description: "H.264 720p — buena calidad HD" },
    { id: "mp4-1080p", label: "Full HD (1080p) — recomendado", quality: "1080", description: "H.264 1080p — alta definición" },
  ],
  webm: [
    { id: "webm-720p", label: "Web 720p", quality: "720", description: "VP9 720p — optimizado para web" },
    { id: "webm-1080p", label: "Web 1080p", quality: "1080", description: "VP9 1080p — alta definición para web" },
  ],
  mkv: [
    { id: "mkv-copy", label: "Sin recodificar (rápido)", quality: "0", description: "Copia directa — sin pérdida de calidad, muy rápido" },
  ],
};

export function getSupportedConversions(
  input: MediaDescriptor,
  tools: ToolCapabilities
): ConversionCapability[] {
  const caps: ConversionCapability[] = [];

  if (!tools.ffmpeg || !tools.ffprobe) {
    return [];
  }

  // Audio output operations (require audio stream)
  if (input.hasAudio) {
    const audioFormats: AudioOutputFormat[] = ["mp3", "m4a", "wav", "flac", "ogg"];
    for (const fmt of audioFormats) {
      const isRecommended = fmt === "mp3";
      caps.push({
        operation: "transcode-audio",
        outputFormat: fmt,
        enabled: true,
        recommended: isRecommended,
        reason: isRecommended ? "Formato de audio más compatible" : undefined,
        presets: AUDIO_PRESETS[fmt],
      });
    }

    // Normalize audio (audio-only operation)
    caps.push({
      operation: "normalize-audio",
      outputFormat: "mp3",
      enabled: true,
      recommended: false,
      reason: "Equilibra el volumen del audio",
      warning: "Puede aumentar el tiempo de procesamiento",
      presets: AUDIO_PRESETS.mp3,
    });
  }

  // Video output operations (require video stream)
  if (input.hasVideo) {
    const videoFormats: VideoOutputFormat[] = ["mp4", "webm", "mkv"];
    for (const fmt of videoFormats) {
      const isRecommended = fmt === "mp4";
      const maxHeight = input.videoStreams[0]?.height ?? null;

      // Filter presets to not exceed source resolution
      let presets = VIDEO_PRESETS[fmt];
      if (maxHeight !== null) {
        presets = presets.filter((p) => {
          const h = parseInt(p.quality, 10);
          return isNaN(h) || h === 0 || h <= maxHeight;
        });
        if (presets.length === 0) presets = [VIDEO_PRESETS[fmt][0]];
      }

      caps.push({
        operation: fmt === "mkv" ? "remux" : "transcode-video",
        outputFormat: fmt,
        enabled: true,
        recommended: isRecommended,
        reason: isRecommended ? "Máxima compatibilidad con reproductores" : undefined,
        presets,
      });
    }

    // Extract audio from video
    if (input.hasAudio) {
      caps.push({
        operation: "extract-audio",
        outputFormat: "mp3",
        enabled: true,
        recommended: false,
        reason: "Extrae solo el audio del vídeo",
        presets: AUDIO_PRESETS.mp3,
      });
    }

    // GIF (only for short durations — under 120s recommended, under 300s allowed)
    const duration = input.durationSeconds;
    const gifEnabled = duration === null || duration <= 300;
    caps.push({
      operation: "create-gif",
      outputFormat: "gif",
      enabled: gifEnabled,
      recommended: false,
      reason: "Animación corta sin audio",
      warning: gifEnabled
        ? duration && duration > 60
          ? "GIFs largos pueden tener tamaños muy grandes. Se recomienda un tramo corto."
          : undefined
        : "El vídeo es demasiado largo para GIF. Selecciona un tramo de menos de 5 minutos.",
      presets: [
        { id: "gif-light", label: "Ligero", quality: "320", description: "320px ancho — tamaño reducido" },
        { id: "gif-balanced", label: "Equilibrado", quality: "480", description: "480px ancho — buen equilibrio" },
        { id: "gif-quality", label: "Alta calidad", quality: "720", description: "720px ancho — mayor calidad" },
      ],
    });

    // Thumbnail
    caps.push({
      operation: "extract-thumbnail",
      outputFormat: "jpg",
      enabled: true,
      recommended: false,
      reason: "Extrae una imagen del vídeo",
      presets: [
        { id: "thumb-jpg", label: "JPG", quality: "jpg", description: "Imagen JPEG comprimida" },
        { id: "thumb-png", label: "PNG", quality: "png", description: "Imagen PNG sin pérdida" },
      ],
    });

    // Subtitles extraction
    if (input.hasSubtitles) {
      caps.push({
        operation: "extract-subtitles",
        outputFormat: "srt",
        enabled: true,
        recommended: false,
        reason: "Extrae los subtítulos internos del archivo",
        presets: [
          { id: "sub-srt", label: "SRT", quality: "srt", description: "Formato de subtítulos más compatible" },
        ],
      });
    }
  }

  // If no audio and no video
  if (!input.hasAudio && !input.hasVideo) {
    return [];
  }

  return caps;
}

export function getRecommendedConversion(
  input: MediaDescriptor,
  caps: ConversionCapability[]
): ConversionCapability | null {
  if (input.hasVideo) {
    return caps.find((c) => c.recommended && c.operation === "transcode-video") ?? null;
  }
  if (input.hasAudio) {
    return caps.find((c) => c.recommended && c.operation === "transcode-audio") ?? null;
  }
  return null;
}
