"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Loader2, RefreshCw, AlertTriangle } from "lucide-react";

interface HealthDependency {
  id: string;
  displayName: string;
  available: boolean;
  version: string | null;
  path: string | null;
  status: "ok" | "missing" | "error";
  recommendedAction: string | null;
}

interface HealthData {
  ok: boolean;
  app: string;
  status: string;
  dependencies: HealthDependency[];
  summary: {
    total: number;
    available: number;
    missing: number;
  };
}

function ToolRow({ dep }: { dep: HealthDependency }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/7 py-3 last:border-0">
      <div className="flex items-start gap-2.5 min-w-0">
        {dep.available ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
        ) : (
          <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <span className="text-sm font-semibold text-stone-100">{dep.displayName}</span>
          {!dep.available && dep.recommendedAction && (
            <p className="mt-0.5 text-[10px] leading-tight text-amber-200/80">
              {dep.recommendedAction}
            </p>
          )}
        </div>
      </div>
      <span className={`shrink-0 font-mono text-xs ${dep.available ? "text-stone-500" : "text-rose-300"}`}>
        {dep.version ?? (dep.available ? "✓" : "✗")}
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
        <h2 className="text-base font-bold text-stone-100">Diagnóstico</h2>
        <button
          type="button"
          onClick={() => refresh()}
          disabled={loading}
          aria-label="Actualizar diagnóstico"
          className="flex min-h-11 items-center gap-1 text-xs font-semibold text-stone-500 hover:text-stone-100 disabled:opacity-50 motion-reduce:transition-none"
        >
          <RefreshCw className={`h-3.5 w-3.5 motion-reduce:animate-none ${loading ? "animate-spin" : ""}`} />
          Verificar
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-stone-500">
          <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" />
        </div>
      ) : !data ? (
        <div className="py-4 text-center text-sm text-rose-300">
          No se pudo conectar al servidor de diagnóstico.
        </div>
      ) : (
        <>
          <div className="rounded-[18px] border border-white/10 bg-[#1a1e25] p-4 shadow-[0_22px_70px_rgba(0,0,0,0.28)]">
            {/* Overall status */}
            <div
              className={`rounded-lg px-3 py-2 mb-4 text-sm flex items-center gap-2 ${
                data.ok
                  ? "border border-emerald-300/20 bg-emerald-400/10 text-emerald-200"
                  : "border border-amber-300/20 bg-amber-400/10 text-amber-200"
              }`}
            >
              {data.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              {data.ok
                ? "Sistema listo para convertir"
                : data.status === "degraded"
                  ? "Funcionalidad limitada — algunos motores no están disponibles"
                  : "Algunas dependencias no están disponibles"}
            </div>

            {/* Summary */}
            <div className="mb-4 flex gap-4 text-xs text-stone-500">
              <span>{data.summary.available}/{data.summary.total} disponibles</span>
              {data.summary.missing > 0 && (
                <span className="text-amber-200">{data.summary.missing} no disponibles</span>
              )}
            </div>

            {/* Tool list */}
            <div>
              {data.dependencies.map((dep) => (
                <ToolRow key={dep.id} dep={dep} />
              ))}
            </div>
          </div>

          {/* Missing tools recommendations */}
          {data.summary.missing > 0 && (
            <div className="space-y-1.5 rounded-[18px] border border-amber-300/18 bg-amber-400/8 p-4 text-sm text-amber-200">
              <p className="font-medium">¿Cómo solucionar esto?</p>
              <ul className="space-y-1 text-xs text-amber-100/75">
                {data.dependencies
                  .filter((d) => !d.available && d.recommendedAction)
                  .map((d) => (
                    <li key={d.id}>• <strong>{d.displayName}:</strong> {d.recommendedAction}</li>
                  ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
