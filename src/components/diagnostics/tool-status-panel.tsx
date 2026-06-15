"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";

interface HealthData {
  ok: boolean;
  status: string;
  dependencies: {
    ytdlp: boolean;
    ffmpeg: boolean;
    ffprobe: boolean;
  };
  versions?: {
    ytdlp?: string;
    ffmpeg?: string;
  };
}

function ToolRow({ name, ok, version }: { name: string; ok: boolean; version?: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-2.5">
        {ok ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
        ) : (
          <XCircle className="h-4 w-4 text-red-400" aria-hidden="true" />
        )}
        <span className="text-sm text-white/80">{name}</span>
      </div>
      <span className={`text-xs font-mono ${ok ? "text-white/40" : "text-red-400"}`}>
        {version ?? (ok ? "Disponible" : "No encontrado")}
      </span>
    </div>
  );
}

interface PanelState {
  data: HealthData | null;
  loading: boolean;
}

export function ToolStatusPanel() {
  const [state, setState] = useState<PanelState>({ data: null, loading: true });

  const load = () => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((json) => setState({ data: json as HealthData, loading: false }))
      .catch(() => setState({ data: null, loading: false }));
  };

  const refresh = () => {
    setState((s) => ({ ...s, loading: true }));
    load();
  };

  useEffect(() => { load(); }, []);

  const { data, loading } = state;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">Diagnóstico</h2>
        <button
          type="button"
          onClick={() => refresh()}
          disabled={loading}
          aria-label="Actualizar diagnóstico"
          className="text-xs text-white/40 hover:text-white/70 flex items-center gap-1 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Verificar
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-white/30">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : !data ? (
        <div className="text-sm text-red-400 py-4 text-center">
          No se pudo conectar al servidor de diagnóstico.
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/3 p-4">
          {/* Overall status */}
          <div
            className={`rounded-lg px-3 py-2 mb-4 text-sm flex items-center gap-2 ${
              data.ok
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "bg-red-500/10 text-red-400 border border-red-500/20"
            }`}
          >
            {data.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {data.ok ? "Sistema listo para convertir" : "Algunas dependencias no están disponibles"}
          </div>

          {/* Tool list */}
          <div>
            <ToolRow name="yt-dlp" ok={data.dependencies.ytdlp} version={data.versions?.ytdlp} />
            <ToolRow name="FFmpeg" ok={data.dependencies.ffmpeg} version={data.versions?.ffmpeg} />
            <ToolRow name="FFprobe" ok={data.dependencies.ffprobe} />
          </div>
        </div>
      )}

      {data && !data.ok && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-400 space-y-1.5">
          <p className="font-medium">¿Cómo solucionar esto?</p>
          <ul className="space-y-1 text-xs text-amber-400/80">
            {!data.dependencies.ytdlp && (
              <li>• Instala yt-dlp: <code className="font-mono bg-white/10 px-1 rounded">pip install yt-dlp</code></li>
            )}
            {(!data.dependencies.ffmpeg || !data.dependencies.ffprobe) && (
              <li>• Instala FFmpeg y asegúrate de que está en el PATH del sistema.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
