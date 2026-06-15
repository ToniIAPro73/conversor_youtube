"use client";

import { Music, Video, Subtitles, Clock, HardDrive, X } from "lucide-react";
import type { AnalysisResult } from "./source-selector";

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

interface Props {
  result: AnalysisResult;
  onReset: () => void;
}

export function InputAnalysisCard({ result, onReset }: Props) {
  const d = result.descriptor;
  const title = result.kind === "remote-url" ? result.title : result.originalName;
  const subtitle = result.kind === "remote-url" ? result.channel : undefined;
  const thumbnailUrl = result.kind === "remote-url" ? result.thumbnailUrl : undefined;
  const sizeBytes = result.kind === "local-file" ? result.sizeBytes : d.sizeBytes;

  const maxHeight = d.videoStreams.reduce((acc, v) => Math.max(acc, v.height ?? 0), 0);
  const audioCount = d.audioStreams.length;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/4 overflow-hidden">
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
            className="shrink-0 rounded-lg p-1.5 text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors"
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
