"use client";

import { useState } from "react";
import { Download, RotateCcw, History, Loader2 } from "lucide-react";

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
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    if (fetching) return;
    setFetching(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/token`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al obtener token");
      const url = data.downloadUrl as string;

      // Trigger download programmatically
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al descargar");
    } finally {
      setFetching(false);
    }
  };

  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-[#1a1e25] p-5 space-y-4 animate-in fade-in slide-in-from-bottom-3 duration-400 motion-reduce:animate-none">
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

      {error && (
        <p role="alert" className="text-sm text-red-400">{error}</p>
      )}

      <div className="space-y-2">
        {downloadTokenHash ? (
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={fetching}
            className="flex items-center justify-center gap-2 w-full h-12 min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-colors disabled:opacity-60 motion-reduce:transition-none"
          >
            {fetching ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                Preparando descarga...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Descargar {format.toUpperCase()}
              </>
            )}
          </button>
        ) : (
          <p className="text-sm text-white/40 text-center">Archivo no disponible.</p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onReset}
            className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl border border-white/10 text-white/50 hover:text-white/80 hover:border-white/25 text-sm transition-colors motion-reduce:transition-none"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Nueva conversión
          </button>
          <button
            type="button"
            onClick={onViewHistory}
            className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl border border-white/10 text-white/50 hover:text-white/80 hover:border-white/25 text-sm transition-colors motion-reduce:transition-none"
          >
            <History className="h-3.5 w-3.5" />
            Historial
          </button>
        </div>
      </div>
    </div>
  );
}
