"use client";

import { useState } from "react";
import { CheckCircle2, AlertTriangle, ChevronDown } from "lucide-react";
import type { ConversionCapability, ConversionPreset } from "@/lib/media/supported-conversions";

const FORMAT_LABELS: Record<string, string> = {
  mp3: "MP3",
  m4a: "M4A / AAC",
  wav: "WAV",
  flac: "FLAC",
  ogg: "OGG / Opus",
  mp4: "MP4 (H.264)",
  webm: "WebM (VP9)",
  mkv: "MKV",
  gif: "GIF",
  jpg: "Imagen JPG",
  png: "Imagen PNG",
  srt: "Subtítulos SRT",
};

const OPERATION_LABELS: Record<string, string> = {
  "transcode-audio": "Convertir audio",
  "transcode-video": "Convertir vídeo",
  "extract-audio": "Extraer audio",
  "remux": "Cambiar contenedor",
  "normalize-audio": "Normalizar volumen",
  "create-gif": "Crear GIF",
  "extract-thumbnail": "Extraer imagen",
  "extract-subtitles": "Extraer subtítulos",
};

interface Props {
  capabilities: ConversionCapability[];
  recommended: { operation: string; format: string; preset: string | null } | null;
  onSelect: (cap: ConversionCapability, preset: ConversionPreset) => void;
  selectedKey: string | null;
}

export function CompatibilityPanel({ capabilities, recommended, onSelect, selectedKey }: Props) {
  const [showAll, setShowAll] = useState(false);
  const enabled = capabilities.filter((c) => c.enabled);
  const visible = showAll ? enabled : enabled.slice(0, 5);

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider">¿Qué quieres hacer?</h2>

      <div className="space-y-2" role="listbox" aria-label="Operaciones disponibles">
        {visible.map((cap) => {
          const key = `${cap.operation}-${cap.outputFormat}`;
          const isSelected = selectedKey === key;
          const isRecommended = cap.recommended;

          return (
            <CapabilityCard
              key={key}
              cap={cap}
              isSelected={isSelected}
              isRecommended={isRecommended}
              recommended={recommended}
              onSelect={(preset) => onSelect(cap, preset)}
            />
          );
        })}
      </div>

      {enabled.length > 5 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors mx-auto"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAll ? "rotate-180" : ""}`} />
          {showAll ? "Mostrar menos" : `Ver ${enabled.length - 5} opciones más`}
        </button>
      )}

      {enabled.length === 0 && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 text-sm text-amber-400 flex gap-2.5">
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
  recommended,
  onSelect,
}: {
  cap: ConversionCapability;
  isSelected: boolean;
  isRecommended: boolean;
  recommended: { operation: string; format: string; preset: string | null } | null;
  onSelect: (preset: ConversionPreset) => void;
}) {
  const defaultPreset = cap.presets.find((p) =>
    recommended?.preset === p.id
  ) ?? cap.presets.find((p) => p.id.includes("balanced") || p.id.includes("compatible")) ?? cap.presets[0];

  const handleClick = () => {
    if (defaultPreset) onSelect(defaultPreset);
  };

  return (
    <div
      className={`rounded-xl border transition-all ${
        isSelected
          ? "border-cyan-500/60 bg-cyan-500/10"
          : "border-white/10 bg-white/3 hover:border-white/20 hover:bg-white/5"
      }`}
    >
      <button
        type="button"
        onClick={handleClick}
        role="option"
        aria-selected={isSelected}
        className="w-full text-left p-4 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 rounded-xl"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-white">
                {FORMAT_LABELS[cap.outputFormat] ?? cap.outputFormat.toUpperCase()}
              </span>
              {isRecommended && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-cyan-500/20 text-cyan-400 font-medium">
                  Recomendado
                </span>
              )}
            </div>
            <p className="text-xs text-white/45 mt-0.5">
              {OPERATION_LABELS[cap.operation] ?? cap.operation}
              {cap.reason ? ` — ${cap.reason}` : ""}
            </p>
            {cap.warning && (
              <p className="text-[11px] text-amber-400/80 mt-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                {cap.warning}
              </p>
            )}
          </div>
          {isSelected && <CheckCircle2 className="h-5 w-5 text-cyan-400 shrink-0" />}
        </div>

        {/* Default preset label */}
        {defaultPreset && (
          <p className="text-[11px] text-white/30 mt-2">
            Calidad: {defaultPreset.label}
          </p>
        )}
      </button>

      {/* Preset selector — only when selected */}
      {isSelected && cap.presets.length > 1 && (
        <div className="px-4 pb-4">
          <p className="text-[11px] text-white/40 mb-2">Selecciona la calidad:</p>
          <div className="flex flex-wrap gap-2">
            {cap.presets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={(e) => { e.stopPropagation(); onSelect(p); }}
                title={p.description}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  defaultPreset?.id === p.id
                    ? "border-cyan-500/60 bg-cyan-500/20 text-cyan-300"
                    : "border-white/10 text-white/50 hover:border-white/25 hover:text-white/75"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
