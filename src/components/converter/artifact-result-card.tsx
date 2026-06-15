"use client";

import { Download, RotateCcw, History } from "lucide-react";

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

interface Props {
  jobId: string;
  fileName: string;
  format: string;
  mimeType: string;
  sizeBytes: number;
  downloadTokenHash: boolean;
  onReset: () => void;
  onViewHistory: () => void;
}

export function ArtifactResultCard({ jobId, fileName, format, sizeBytes, downloadTokenHash, onReset, onViewHistory }: Props) {
  const downloadUrl = `/api/download/${jobId}`;

  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-4 animate-in fade-in slide-in-from-bottom-3 duration-400">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
          <Download className="h-5 w-5 text-emerald-400" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate">{fileName}</p>
          <p className="text-xs text-white/40 mt-0.5">
            {format.toUpperCase()} · {formatSize(sizeBytes)}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {downloadTokenHash ? (
          <a
            href={downloadUrl}
            download={fileName}
            className="flex items-center justify-center gap-2 w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-colors"
          >
            <Download className="h-4 w-4" />
            Descargar {format.toUpperCase()}
          </a>
        ) : (
          <p className="text-sm text-white/40 text-center">Archivo no disponible (token inválido).</p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onReset}
            className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl border border-white/10 text-white/50 hover:text-white/80 hover:border-white/25 text-sm transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Nueva conversión
          </button>
          <button
            type="button"
            onClick={onViewHistory}
            className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl border border-white/10 text-white/50 hover:text-white/80 hover:border-white/25 text-sm transition-colors"
          >
            <History className="h-3.5 w-3.5" />
            Historial
          </button>
        </div>
      </div>
    </div>
  );
}
