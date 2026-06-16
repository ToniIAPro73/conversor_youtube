"use client";

import {
  Music, Video, Subtitles, Clock, HardDrive, X,
  FileText, Image as ImageIcon, FileArchive, Table2,
  Presentation, BookOpen, FileType, FileCode, File
} from "lucide-react";
import type { AnalysisResult, UniversalAnalysisResult } from "./source-selector";
import type { FileAttributes } from "@/lib/domain/descriptors";

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// Category display configuration
const CATEGORY_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  audio: { icon: Music, label: "Audio", color: "bg-emerald-500/15 text-emerald-400" },
  video: { icon: Video, label: "Vídeo", color: "bg-blue-500/15 text-blue-400" },
  image: { icon: ImageIcon, label: "Imagen", color: "bg-pink-500/15 text-pink-400" },
  document: { icon: FileText, label: "Documento", color: "bg-orange-500/15 text-orange-400" },
  spreadsheet: { icon: Table2, label: "Hoja de cálculo", color: "bg-green-500/15 text-green-400" },
  presentation: { icon: Presentation, label: "Presentación", color: "bg-amber-500/15 text-amber-400" },
  pdf: { icon: FileType, label: "PDF", color: "bg-red-500/15 text-red-400" },
  ebook: { icon: BookOpen, label: "Ebook", color: "bg-violet-500/15 text-violet-400" },
  archive: { icon: FileArchive, label: "Archivo comprimido", color: "bg-yellow-500/15 text-yellow-400" },
  "structured-data": { icon: FileCode, label: "Datos estructurados", color: "bg-cyan-500/15 text-cyan-400" },
  "plain-text": { icon: FileText, label: "Texto", color: "bg-slate-500/15 text-slate-400" },
  unknown: { icon: File, label: "Desconocido", color: "bg-white/10 text-white/40" },
};

// Confidence badge colors
const CONFIDENCE_CONFIG: Record<string, string> = {
  high: "bg-emerald-500/15 text-emerald-400",
  medium: "bg-amber-500/15 text-amber-400",
  low: "bg-red-500/15 text-red-400",
};

interface Props {
  result: AnalysisResult;
  onReset: () => void;
}

export function InputAnalysisCard({ result, onReset }: Props) {
  // Universal file analysis
  if (result.kind === "universal-file") {
    return <UniversalFileCard result={result} onReset={onReset} />;
  }

  // Media analysis (remote-url or local-file)
  return <MediaFileCard result={result} onReset={onReset} />;
}

function UniversalFileCard({ result, onReset }: { result: UniversalAnalysisResult; onReset: () => void }) {
  const { originalName, sizeBytes, category, detectedFormat, confidence } = result;
  const catConfig = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.unknown;
  const CatIcon = catConfig.icon;

  // Get attributes from universalDescriptor for detailed info
  const attrs = (result.universalDescriptor as { attributes?: FileAttributes } | undefined)?.attributes;
  const descriptor = result.universalDescriptor as Record<string, unknown> | undefined;
  const detectedMime = (descriptor?.detectedMimeType as string) ?? null;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#1a1e25] overflow-hidden">
      {/* Category header stripe */}
      <div className={`px-4 py-2.5 flex items-center gap-2 ${catConfig.color.replace(/\/\d+$/, "/8")} border-b border-white/5`}>
        <CatIcon className="h-4 w-4" aria-hidden="true" />
        <span className="text-xs font-semibold uppercase tracking-wider">{catConfig.label}</span>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-white text-sm leading-snug line-clamp-2">{originalName}</p>
          </div>
          <button
            type="button"
            onClick={onReset}
            aria-label="Resetear entrada"
            className="shrink-0 rounded-lg p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors motion-reduce:transition-none"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-2">
          {/* Category badge */}
          <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg ${catConfig.color}`}>
            <CatIcon className="h-3 w-3" aria-hidden="true" />
            {catConfig.label}
          </span>

          {/* Format badge */}
          {detectedFormat && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-white/8 text-white/50">
              {detectedFormat.toUpperCase()}
            </span>
          )}

          {/* Confidence badge */}
          <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg ${CONFIDENCE_CONFIG[confidence] ?? CONFIDENCE_CONFIG.medium}`}>
            {confidence === "high" ? "Alta confianza" : confidence === "medium" ? "Confianza media" : "Baja confianza"}
          </span>

          {/* Size badge */}
          {sizeBytes > 0 && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-white/8 text-white/50">
              <HardDrive className="h-3 w-3" aria-hidden="true" />
              {formatSize(sizeBytes)}
            </span>
          )}
        </div>

        {/* Category-specific details */}
        {attrs && <CategoryDetails attrs={attrs} category={category} detectedMime={detectedMime} />}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function CategoryDetails({ attrs, category: _category, detectedMime }: { attrs: FileAttributes; category: string; detectedMime: string | null }) {
  const details: React.ReactNode[] = [];

  switch (attrs.kind) {
    case "image": {
      if (attrs.width && attrs.height) details.push(<span key="dim">{attrs.width}×{attrs.height}px</span>);
      if (attrs.format) details.push(<span key="fmt">{attrs.format.toUpperCase()}</span>);
      if (attrs.hasAlpha) details.push(<span key="alpha">Canal alfa</span>);
      if (attrs.animated) details.push(<span key="anim">Animado ({attrs.frames} fotogramas)</span>);
      break;
    }
    case "document": {
      if (attrs.pageCount !== null) details.push(<span key="pages">{attrs.pageCount} páginas</span>);
      if (attrs.wordCount !== null) details.push(<span key="words">{attrs.wordCount.toLocaleString()} palabras</span>);
      break;
    }
    case "pdf": {
      if (attrs.pageCount !== null) details.push(<span key="pages">{attrs.pageCount} páginas</span>);
      if (attrs.pdfVersion) details.push(<span key="ver">PDF {attrs.pdfVersion}</span>);
      if (attrs.isEncrypted) details.push(<span key="enc">Cifrado</span>);
      break;
    }
    case "spreadsheet": {
      if (attrs.sheetCount !== null) details.push(<span key="sheets">{attrs.sheetCount} hojas</span>);
      if (attrs.rowCount !== null) details.push(<span key="rows">{attrs.rowCount.toLocaleString()} filas</span>);
      if (attrs.hasFormulas) details.push(<span key="form">Con fórmulas</span>);
      break;
    }
    case "presentation": {
      if (attrs.slideCount !== null) details.push(<span key="slides">{attrs.slideCount} diapositivas</span>);
      if (attrs.hasEmbeddedMedia) details.push(<span key="media">Con multimedia</span>);
      break;
    }
    case "ebook": {
      if (attrs.pageCount !== null) details.push(<span key="pages">{attrs.pageCount} páginas</span>);
      if (attrs.title) details.push(<span key="title">{attrs.title}</span>);
      if (attrs.author) details.push(<span key="author">{attrs.author}</span>);
      if (attrs.hasDrm) details.push(<span key="drm">DRM</span>);
      break;
    }
    case "archive": {
      if (attrs.entryCount !== null) details.push(<span key="files">{attrs.entryCount} archivos</span>);
      if (attrs.uncompressedBytes !== null) details.push(<span key="usize">Descomprimido: {formatSize(attrs.uncompressedBytes)}</span>);
      if (attrs.archiveFormat) details.push(<span key="fmt">{attrs.archiveFormat.toUpperCase()}</span>);
      if (attrs.isEncrypted) details.push(<span key="enc">Cifrado</span>);
      break;
    }
    case "structured-data": {
      if (attrs.format) details.push(<span key="fmt">{attrs.format.toUpperCase()}</span>);
      if (attrs.rowCount !== null) details.push(<span key="rows">{attrs.rowCount.toLocaleString()} registros</span>);
      if (attrs.columnCount !== null) details.push(<span key="cols">{attrs.columnCount} columnas</span>);
      break;
    }
    case "text": {
      if (attrs.format) details.push(<span key="fmt">{attrs.format.toUpperCase()}</span>);
      if (attrs.lineCount !== null) details.push(<span key="lines">{attrs.lineCount.toLocaleString()} líneas</span>);
      if (attrs.encoding) details.push(<span key="enc">{attrs.encoding}</span>);
      break;
    }
    case "media": {
      if (attrs.durationSeconds !== null) details.push(<span key="dur">{formatDuration(attrs.durationSeconds)}</span>);
      if (attrs.width && attrs.height) details.push(<span key="dim">{attrs.width}×{attrs.height}</span>);
      break;
    }
    default:
      break;
  }

  if (detectedMime) {
    details.push(<span key="mime" className="text-white/25">{detectedMime}</span>);
  }

  if (details.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/40">
      {details}
    </div>
  );
}

function MediaFileCard({ result, onReset }: { result: Extract<AnalysisResult, { kind: "remote-url" | "local-media" }>; onReset: () => void }) {
  const d = result.descriptor;
  const title = result.kind === "remote-url" ? result.title : result.originalName;
  const subtitle = result.kind === "remote-url" ? result.channel : undefined;
  const thumbnailUrl = result.kind === "remote-url" ? result.thumbnailUrl : undefined;
  const sizeBytes = result.kind === "local-media" ? result.sizeBytes : d.sizeBytes;

  const maxHeight = d.videoStreams.reduce((acc, v) => Math.max(acc, v.height ?? 0), 0);
  const audioCount = d.audioStreams.length;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#1a1e25] overflow-hidden">
      {/* Thumbnail or header */}
      {thumbnailUrl && (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbnailUrl}
            alt={`Miniatura de ${title}`}
            className="w-full aspect-video object-cover opacity-70"
          />
          <div className="absolute inset-0 bg-linear-to-t from-black/80 to-transparent" />
        </div>
      )}

      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-white text-sm leading-snug line-clamp-2">{title}</p>
            {subtitle && (
              <p className="text-xs text-white/40 mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onReset}
            aria-label="Resetear entrada"
            className="shrink-0 rounded-lg p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors motion-reduce:transition-none"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-2">
          {d.hasAudio && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-400">
              <Music className="h-3 w-3" aria-hidden="true" />
              {audioCount > 1 ? `${audioCount} pistas audio` : "Audio"}
            </span>
          )}
          {d.hasVideo && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-blue-500/15 text-blue-400">
              <Video className="h-3 w-3" aria-hidden="true" />
              {maxHeight > 0 ? `Vídeo ${maxHeight}p` : "Vídeo"}
            </span>
          )}
          {d.hasSubtitles && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-amber-500/15 text-amber-400">
              <Subtitles className="h-3 w-3" aria-hidden="true" />
              Subtítulos
            </span>
          )}
          {d.durationSeconds !== null && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-white/8 text-white/50">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {formatDuration(d.durationSeconds)}
            </span>
          )}
          {sizeBytes !== null && sizeBytes > 0 && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-white/8 text-white/50">
              <HardDrive className="h-3 w-3" aria-hidden="true" />
              {formatSize(sizeBytes)}
            </span>
          )}
        </div>

        {/* Streams detail (collapsible via summary) */}
        {(d.videoStreams.length > 0 || d.audioStreams.length > 1) && (
          <details className="group">
            <summary className="text-[11px] text-white/30 cursor-pointer hover:text-white/50 list-none flex items-center gap-1">
              <span className="group-open:hidden">▶ Ver detalles técnicos</span>
              <span className="hidden group-open:inline">▼ Ocultar detalles</span>
            </summary>
            <div className="mt-2 space-y-1">
              {d.videoStreams.map((v, i) => (
                <p key={i} className="text-[11px] text-white/35">
                  Vídeo {i}: {v.codec.toUpperCase()}
                  {v.width && v.height ? ` ${v.width}×${v.height}` : ""}
                  {v.fps ? ` @ ${v.fps} fps` : ""}
                </p>
              ))}
              {d.audioStreams.map((a, i) => (
                <p key={i} className="text-[11px] text-white/35">
                  Audio {i}: {a.codec.toUpperCase()}
                  {a.channels ? ` (${a.channels} ch)` : ""}
                  {a.language ? ` [${a.language}]` : ""}
                  {a.isDefault ? " ✓" : ""}
                </p>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
