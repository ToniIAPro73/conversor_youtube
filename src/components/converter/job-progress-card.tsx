"use client";

import { Loader2, X, CheckCircle2, AlertTriangle } from "lucide-react";

interface JobProgressCardProps {
  jobId: string;
  status: string;
  stage: string;
  progress: number;
  error?: string;
  onCancel?: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  queued: "En cola",
  downloading: "Descargando",
  processing: "Procesando",
  verifying: "Verificando",
  completed: "Completado",
  failed: "Error",
  cancelled: "Cancelado",
  interrupted: "Interrumpido",
};

export function JobProgressCard({ status, stage, progress, error, onCancel }: JobProgressCardProps) {
  const isActive = ["queued", "downloading", "processing", "verifying"].includes(status);
  const isCompleted = status === "completed";
  const isFailed = status === "failed";

  return (
    <div className="rounded-2xl border border-white/10 bg-[#1a1e25] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {isActive && <Loader2 className="h-4 w-4 text-cyan-400 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          {isCompleted && <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />}
          {isFailed && <AlertTriangle className="h-4 w-4 text-red-400" aria-hidden="true" />}
          <div>
            <p className="text-sm font-semibold text-white">{STATUS_LABELS[status] ?? status}</p>
            <p className="text-xs text-white/40">{stage}</p>
          </div>
        </div>
        {isActive && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancelar conversión"
            className="rounded-lg px-3 py-1.5 min-h-[44px] text-xs text-white/40 hover:text-red-400 hover:bg-red-500/10 border border-white/10 hover:border-red-500/30 transition-colors flex items-center gap-1 motion-reduce:transition-none"
          >
            <X className="h-3.5 w-3.5" />
            Cancelar
          </button>
        )}
      </div>

      {/* Progress bar */}
      {isActive && (
        <div role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Progreso: ${progress}%`}>
          <div className="flex justify-between text-[11px] text-white/30 mb-1.5">
            <span>Progreso</span>
            <span>{progress > 0 ? `${Math.round(progress)}%` : "..."}</span>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500 motion-reduce:transition-none"
              style={{ width: `${Math.max(progress, 3)}%` }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {isFailed && error && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400"
        >
          {error}
        </div>
      )}
    </div>
  );
}
