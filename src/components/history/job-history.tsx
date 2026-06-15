"use client";

import { useEffect, useState } from "react";
import { Clock, CheckCircle2, AlertTriangle, Loader2, Download, RotateCcw, XCircle, Cpu } from "lucide-react";

// Category badge config
const CATEGORY_BADGES: Record<string, { label: string; cls: string }> = {
  audio: { label: "Audio", cls: "bg-emerald-500/15 text-emerald-400" },
  video: { label: "Vídeo", cls: "bg-blue-500/15 text-blue-400" },
  image: { label: "Imagen", cls: "bg-pink-500/15 text-pink-400" },
  document: { label: "Documento", cls: "bg-orange-500/15 text-orange-400" },
  spreadsheet: { label: "Hoja cálculo", cls: "bg-green-500/15 text-green-400" },
  presentation: { label: "Presentación", cls: "bg-amber-500/15 text-amber-400" },
  pdf: { label: "PDF", cls: "bg-red-500/15 text-red-400" },
  ebook: { label: "Ebook", cls: "bg-violet-500/15 text-violet-400" },
  archive: { label: "Archivo", cls: "bg-yellow-500/15 text-yellow-400" },
  "structured-data": { label: "Datos", cls: "bg-cyan-500/15 text-cyan-400" },
  "plain-text": { label: "Texto", cls: "bg-slate-500/15 text-slate-400" },
};

// Engine display names
const ENGINE_NAMES: Record<string, string> = {
  "ffmpeg-media": "FFmpeg",
  "sharp-image": "Sharp",
  "data-ts": "Data Engine",
  qpdf: "QPDF",
  sevenzip: "7-Zip",
  pandoc: "Pandoc",
  libreoffice: "LibreOffice",
};

// Loss profile badge config
const LOSS_PROFILE_BADGES: Record<string, { label: string; cls: string }> = {
  lossless: { label: "Sin pérdida", cls: "bg-emerald-500/20 text-emerald-400" },
  "metadata-risk": { label: "Riesgo meta", cls: "bg-amber-500/20 text-amber-400" },
  "layout-risk": { label: "Riesgo formato", cls: "bg-orange-500/20 text-orange-400" },
  lossy: { label: "Con pérdida", cls: "bg-red-500/20 text-red-400" },
  experimental: { label: "Experimental", cls: "bg-purple-500/20 text-purple-400" },
};

interface HistoryJob {
  id: string;
  inputTitle: string | null;
  inputKind: string;
  operation: string;
  outputFormat: string;
  quality: string;
  status: string;
  stage: string;
  progress: number;
  errorMessage: string | null;
  fileSizeBytes: number | null;
  outputFileName: string | null;
  downloadAvailable: boolean;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string;
  // Universal fields
  category: string | null;
  engineId: string | null;
  lossProfile: string | null;
  conversionId: string | null;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
    completed: { icon: <CheckCircle2 className="h-3 w-3" />, label: "Completado", cls: "bg-emerald-500/15 text-emerald-400" },
    failed: { icon: <AlertTriangle className="h-3 w-3" />, label: "Error", cls: "bg-red-500/15 text-red-400" },
    cancelled: { icon: <XCircle className="h-3 w-3" />, label: "Cancelado", cls: "bg-white/10 text-white/40" },
    interrupted: { icon: <XCircle className="h-3 w-3" />, label: "Interrumpido", cls: "bg-amber-500/15 text-amber-400" },
    queued: { icon: <Clock className="h-3 w-3" />, label: "En cola", cls: "bg-white/10 text-white/50" },
    downloading: { icon: <Loader2 className="h-3 w-3 animate-spin" />, label: "Descargando", cls: "bg-blue-500/15 text-blue-400" },
    processing: { icon: <Loader2 className="h-3 w-3 animate-spin" />, label: "Procesando", cls: "bg-cyan-500/15 text-cyan-400" },
    expired: { icon: <Clock className="h-3 w-3" />, label: "Expirado", cls: "bg-white/8 text-white/30" },
  };
  const s = map[status] ?? { icon: null, label: status, cls: "bg-white/8 text-white/40" };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md font-medium ${s.cls}`}>
      {s.icon}
      {s.label}
    </span>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "ahora mismo";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

interface HistoryState {
  jobs: HistoryJob[];
  loading: boolean;
}

export function JobHistory() {
  const [state, setState] = useState<HistoryState>({ jobs: [], loading: true });
  const [filter, setFilter] = useState<"all" | "completed" | "failed">("all");

  const load = () => {
    fetch("/api/history")
      .then((r) => r.json())
      .then((data) => setState({ jobs: (data as { jobs: HistoryJob[] }).jobs ?? [], loading: false }))
      .catch(() => setState((s) => ({ ...s, loading: false })));
  };

  const refresh = () => {
    setState((s) => ({ ...s, loading: true }));
    load();
  };

  useEffect(() => { load(); }, []);

  const { jobs, loading } = state;

  const filtered = jobs.filter((j) => {
    if (filter === "all") return true;
    return j.status === filter;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">Historial</h2>
        <button
          type="button"
          onClick={() => refresh()}
          className="text-xs text-white/40 hover:text-white/70 flex items-center gap-1 min-h-[44px] motion-reduce:transition-none"
        >
          <RotateCcw className="h-3 w-3" />
          Actualizar
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5">
        {(["all", "completed", "failed"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 min-h-[44px] rounded-lg text-xs transition-colors motion-reduce:transition-none ${
              filter === f ? "bg-white/15 text-white" : "text-white/40 hover:text-white/70"
            }`}
          >
            {{ all: "Todos", completed: "Completados", failed: "Errores" }[f]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-white/30">
          <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-white/25 text-sm">
          Sin conversiones {filter !== "all" ? "en este estado" : "recientes"}
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto" role="list" aria-label="Conversiones anteriores" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}>
          {filtered.map((job) => {
            const isUniversal = job.inputKind === "universal-file" || !!job.category;
            const catBadge = job.category ? CATEGORY_BADGES[job.category] : null;
            const engineName = job.engineId ? ENGINE_NAMES[job.engineId] ?? job.engineId : null;
            const lossBadge = job.lossProfile ? LOSS_PROFILE_BADGES[job.lossProfile] : null;

            return (
              <div
                key={job.id}
                role="listitem"
                className="rounded-xl border border-white/12 bg-[#1a1e25] p-3.5 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white/80 truncate">
                      {job.inputTitle ?? job.outputFileName ?? job.id.slice(0, 12)}
                    </p>
                    <p className="text-[11px] text-white/35 mt-0.5">
                      {job.outputFormat.toUpperCase()} · {relativeDate(job.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={job.status} />
                </div>

                {/* Universal job badges */}
                {isUniversal && (
                  <div className="flex flex-wrap gap-1.5">
                    {catBadge && (
                      <span className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-md font-medium ${catBadge.cls}`}>
                        {catBadge.label}
                      </span>
                    )}
                    {engineName && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-white/8 text-white/40 font-medium">
                        <Cpu className="h-2.5 w-2.5" />
                        {engineName}
                      </span>
                    )}
                    {lossBadge && (
                      <span className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-md font-medium ${lossBadge.cls}`}>
                        {lossBadge.label}
                      </span>
                    )}
                  </div>
                )}

                {job.status === "completed" && job.downloadAvailable && (
                  <a
                    href={`/api/download/${job.id}`}
                    download={job.outputFileName ?? undefined}
                    className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Descargar {job.fileSizeBytes ? `(${formatSize(job.fileSizeBytes)})` : ""}
                  </a>
                )}

                {job.status === "completed" && !job.downloadAvailable && (
                  <p className="text-[11px] text-white/25 italic">Archivo expirado — no disponible para descarga.</p>
                )}

                {job.errorMessage && (
                  <p className="text-[11px] text-red-400/80">{job.errorMessage}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
