"use client";

import { useState } from "react";
import { CheckCircle2, AlertTriangle, ChevronDown, Wrench, XCircle } from "lucide-react";
import type { CapabilityInfo, CapabilityLossProfile } from "@/lib/domain/unified-analysis";

// Loss profile badge configuration
const LOSS_PROFILE_CONFIG: Record<CapabilityLossProfile, { label: string; cls: string }> = {
  lossless: { label: "Sin pérdida", cls: "bg-emerald-400/12 text-emerald-200 ring-1 ring-emerald-300/18" },
  "metadata-risk": { label: "Riesgo metadatos", cls: "bg-amber-400/12 text-amber-200 ring-1 ring-amber-300/18" },
  "layout-risk": { label: "Riesgo formato", cls: "bg-orange-400/12 text-orange-200 ring-1 ring-orange-300/18" },
  lossy: { label: "Con pérdida", cls: "bg-rose-400/12 text-rose-200 ring-1 ring-rose-300/18" },
  experimental: { label: "Experimental", cls: "bg-violet-400/12 text-violet-200 ring-1 ring-violet-300/18" },
};

// Engine display names
const ENGINE_DISPLAY_NAMES: Record<string, string> = {
  "ffmpeg-media": "FFmpeg",
  "sharp-image": "Sharp",
  "data-ts": "Data Engine",
  qpdf: "QPDF",
  sevenzip: "7-Zip",
  pandoc: "Pandoc",
  libreoffice: "LibreOffice",
  calibre: "Calibre",
  tesseract: "Tesseract",
};

interface Props {
  capabilities: CapabilityInfo[];
  recommended: CapabilityInfo | null;
  onSelect: (cap: CapabilityInfo) => void;
  selectedKey: string | null;
}

export function CompatibilityPanel({ capabilities, recommended, onSelect, selectedKey }: Props) {
  const [showAll, setShowAll] = useState(false);
  // Show available first, then unavailable
  const available = capabilities.filter((c) => c.state === "available");
  const unavailable = capabilities.filter((c) => c.state !== "available");
  const sorted = [...available, ...unavailable];
  const visible = showAll ? sorted : sorted.slice(0, 5);

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold text-stone-200">Elige la salida</h2>

      <div className="space-y-2" role="listbox" aria-label="Operaciones disponibles">
        {visible.map((cap) => {
          const isSelected = selectedKey === cap.id;
          const isRecommended = recommended?.id === cap.id;

          return (
            <CapabilityCard
              key={cap.id}
              cap={cap}
              isSelected={isSelected}
              isRecommended={isRecommended}
              onSelect={() => onSelect(cap)}
            />
          );
        })}
      </div>

      {sorted.length > 5 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mx-auto flex min-h-[44px] items-center gap-1.5 text-xs font-semibold text-stone-500 transition-colors hover:text-stone-200"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAll ? "rotate-180" : ""}`} />
          {showAll ? "Mostrar menos" : `Ver ${sorted.length - 5} opciones más`}
        </button>
      )}

      {available.length === 0 && (
        <div className="flex gap-2.5 rounded-xl border border-amber-400/20 bg-amber-400/8 p-4 text-sm text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>No se encontraron conversiones compatibles para este archivo.</span>
        </div>
      )}
    </div>
  );
}

function CapabilityCard({
  cap,
  isSelected,
  isRecommended,
  onSelect,
}: {
  cap: CapabilityInfo;
  isSelected: boolean;
  isRecommended: boolean;
  onSelect: () => void;
}) {
  const isAvailable = cap.state === "available";
  const isUnavailableTool = cap.state === "unavailable-tool";
  const lossConfig = LOSS_PROFILE_CONFIG[cap.lossProfile] ?? LOSS_PROFILE_CONFIG.lossy;
  const engineName = ENGINE_DISPLAY_NAMES[cap.engineId] ?? cap.engineId;

  return (
    <div
      className={`rounded-xl border transition-all ${
        isSelected
          ? "border-teal-300/55 bg-[#1a1e25] shadow-[0_18px_50px_rgba(20,184,166,0.10)]"
          : isAvailable
            ? "border-white/10 bg-[#1a1e25] hover:border-teal-200/28 hover:bg-[#1f242c]"
            : "border-white/5 bg-[#1a1e25] opacity-55"
      }`}
    >
      <button
        type="button"
        onClick={isAvailable ? onSelect : undefined}
        role="option"
        aria-selected={isSelected}
        disabled={!isAvailable}
        className="min-h-[44px] w-full rounded-xl p-3 text-left focus:outline-none focus:ring-2 focus:ring-teal-300/50 disabled:cursor-not-allowed motion-reduce:transition-none sm:p-4"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-stone-100">
                {cap.outputLabel}
              </span>
              {isRecommended && (
                <span className="rounded-md bg-teal-300 px-1.5 py-0.5 text-[10px] font-black text-[#071112]">
                  Recomendado
                </span>
              )}
              {/* Loss profile badge */}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${lossConfig.cls}`}>
                {lossConfig.label}
              </span>
              {/* Engine badge */}
              <span className="rounded-md bg-stone-200/8 px-1.5 py-0.5 text-[10px] font-semibold text-stone-400">
                {engineName}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-stone-500">
              {cap.outputFormat.toUpperCase()}
            </p>

            {/* Tool not installed warning */}
            {isUnavailableTool && (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-rose-300/85">
                <Wrench className="h-3 w-3 shrink-0" />
                Herramienta no instalada — {engineName} es necesario
              </p>
            )}

            {/* Unsupported state */}
            {cap.state === "unsupported" && (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-stone-500">
                <XCircle className="h-3 w-3 shrink-0" />
                No soportado para este archivo
              </p>
            )}

            {/* Warnings */}
            {cap.warnings.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {cap.warnings.map((w, i) => (
                  <p key={i} className="flex items-center gap-1 text-[11px] text-amber-200/85">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    {w}
                  </p>
                ))}
              </div>
            )}
          </div>
          {isSelected && <CheckCircle2 className="h-5 w-5 shrink-0 text-teal-200" />}
        </div>
      </button>
    </div>
  );
}
