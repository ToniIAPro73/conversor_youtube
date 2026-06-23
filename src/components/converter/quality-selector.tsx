"use client";

import { cn } from "@/lib/utils";
import type { QualityProfile } from "@/lib/quality/quality-contract";
import type { VideoFormat } from "@/lib/media/metadata";

interface QualitySelectorProps {
  format: "mp3" | "mp4";
  quality: string;
  onQualityChange: (quality: string) => void;
  availableHeights: number[];
  // Extended props (optional — backward-compatible)
  qualityProfile?: QualityProfile;
  onProfileChange?: (profile: QualityProfile) => void;
  videoFormats?: VideoFormat[];
}

const MP3_QUALITIES = ["128", "192", "256", "320"] as const;

const ALL_RESOLUTION_OPTIONS = ["max", 360, 480, 720, 1080, 1440, 2160] as const;
type ResolutionOption = (typeof ALL_RESOLUTION_OPTIONS)[number];

function getAccentClasses(format: "mp3" | "mp4", isActive: boolean) {
  if (!isActive) return {};
  if (format === "mp3") {
    return {
      container:
        "border-cyan-500/35 bg-gradient-to-b from-cyan-500/[0.15] to-blue-600/[0.08] shadow-[0_0_20px_rgba(6,182,212,0.18),inset_0_1px_0_rgba(255,255,255,0.07)]",
      value: "text-white",
      unit: "text-cyan-400/70",
      bar: "bg-cyan-400",
    };
  }
  return {
    container:
      "border-violet-500/35 bg-gradient-to-b from-violet-500/[0.15] to-purple-600/[0.08] shadow-[0_0_20px_rgba(139,92,246,0.18),inset_0_1px_0_rgba(255,255,255,0.07)]",
    value: "text-white",
    unit: "text-violet-400/70",
    bar: "bg-violet-400",
  };
}

/** Returns max FPS available at or above a given height across all videoFormats. */
function maxFpsAtHeight(videoFormats: VideoFormat[], height: number): number | null {
  const candidates = videoFormats
    .filter((f) => f.height !== null && f.height >= height && f.fps !== null)
    .map((f) => f.fps as number);
  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}

export function QualitySelector({
  format,
  quality,
  onQualityChange,
  availableHeights,
  qualityProfile,
  onProfileChange,
  videoFormats,
}: QualitySelectorProps) {
  // --- MP3 branch ---
  if (format === "mp3") {
    const currentQualities: readonly string[] = MP3_QUALITIES;
    return (
      <div className="space-y-2.5">
        <label className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/35 ml-0.5">
          Selecciona la calidad
        </label>

        <div className="flex gap-1.5 p-1.5 bg-white/[0.025] border border-white/[0.06] rounded-2xl backdrop-blur-sm">
          {currentQualities.map((q, index) => {
            const isActive = quality === q;
            const accent = getAccentClasses(format, isActive);
            const filledBars = index + 1;

            return (
              <button
                key={q}
                type="button"
                onClick={() => onQualityChange(q)}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-1.5 py-3 px-1 rounded-xl transition-all duration-300",
                  "border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
                  isActive
                    ? accent.container
                    : "border-transparent text-white/30 hover:text-white/60 hover:bg-white/[0.04]"
                )}
              >
                <div className="flex items-end gap-[2.5px] h-[14px]">
                  {[1, 2, 3, 4].map((b) => {
                    const filled = b <= filledBars;
                    return (
                      <div
                        key={b}
                        className={cn(
                          "w-[3px] rounded-[1.5px] transition-all duration-300",
                          filled
                            ? isActive
                              ? accent.bar
                              : "bg-white/25"
                            : "bg-white/[0.08]"
                        )}
                        style={{ height: `${b * 3 + 2}px` }}
                      />
                    );
                  })}
                </div>
                <span
                  className={cn(
                    "text-[13px] font-bold leading-none transition-colors duration-300",
                    isActive ? accent.value : "text-white/40"
                  )}
                >
                  {q}
                </span>
                <span
                  className={cn(
                    "text-[8px] font-semibold uppercase tracking-[0.1em] transition-colors duration-300",
                    isActive ? accent.unit : "text-white/20"
                  )}
                >
                  kbps
                </span>
              </button>
            );
          })}
        </div>

        <p className="text-[10px] text-white/25 italic ml-0.5 leading-relaxed">
          La conversión no puede mejorar la calidad del audio original.
        </p>
      </div>
    );
  }

  // --- MP4 branch ---
  const activeProfile: QualityProfile = qualityProfile ?? "mp4-compatible";

  // Profile toggle (only shown when onProfileChange is provided)
  const showProfileToggle = !!onProfileChange;

  // Compute available resolution options
  const availableResolutions: ResolutionOption[] = ALL_RESOLUTION_OPTIONS.filter((h) => {
    if (h === "max") return true;
    if (videoFormats && videoFormats.length > 0) {
      return videoFormats.some((f) => f.height !== null && f.height >= h);
    }
    // Fall back to availableHeights if videoFormats not provided
    return availableHeights.some((ah) => ah >= h) || h === 360;
  });

  // When profile is source-max + max, skip resolution selector (any resolution applies)
  const hideResolutionSelector =
    activeProfile === "source-max" && quality === "max";

  const accent = getAccentClasses("mp4", true);

  return (
    <div className="space-y-3">
      <label className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/35 ml-0.5">
        Selecciona la calidad
      </label>

      {/* Section 1 — Delivery profile (only when parent handles profile changes) */}
      {showProfileToggle && (
        <div className="space-y-1.5">
          <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/25 ml-0.5">
            Perfil de entrega
          </span>
          <div className="flex gap-1.5 p-1.5 bg-white/[0.025] border border-white/[0.06] rounded-2xl backdrop-blur-sm">
            {(["source-max", "mp4-compatible"] as const).map((profile) => {
              const isActive = activeProfile === profile;
              return (
                <button
                  key={profile}
                  type="button"
                  onClick={() => onProfileChange!(profile)}
                  className={cn(
                    "flex-1 flex flex-col items-start gap-0.5 py-2.5 px-3 rounded-xl transition-all duration-300",
                    "border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
                    isActive
                      ? accent.container
                      : "border-transparent text-white/30 hover:text-white/60 hover:bg-white/[0.04]"
                  )}
                >
                  <span
                    className={cn(
                      "text-[11px] font-bold leading-none transition-colors duration-300",
                      isActive ? "text-white" : "text-white/40"
                    )}
                  >
                    {profile === "source-max"
                      ? "Máxima calidad original"
                      : "MP4 compatible"}
                  </span>
                  <span
                    className={cn(
                      "text-[8px] leading-relaxed transition-colors duration-300",
                      isActive ? "text-violet-300/70" : "text-white/20"
                    )}
                  >
                    {profile === "source-max"
                      ? "Sin recodificación · preserva 4K/60fps · puede ser MKV/WebM"
                      : "Compatible con más reproductores · puede requerir recodificación"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Section 2 — Resolution limit */}
      {!hideResolutionSelector && (
        <div className="space-y-1.5">
          {showProfileToggle && (
            <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/25 ml-0.5">
              Resolución máxima
            </span>
          )}
          <div className="flex gap-1.5 p-1.5 bg-white/[0.025] border border-white/[0.06] rounded-2xl backdrop-blur-sm flex-wrap">
            {availableResolutions.map((res, index) => {
              const resStr = String(res);
              const isActive = quality === resStr;
              const resAccent = getAccentClasses("mp4", isActive);
              const filledBars = Math.min(index + 1, 4);

              // Get max FPS label for numeric heights when videoFormats is available
              const fpsLabel =
                res !== "max" && videoFormats && videoFormats.length > 0
                  ? maxFpsAtHeight(videoFormats, res as number)
                  : null;

              return (
                <button
                  key={resStr}
                  type="button"
                  onClick={() => onQualityChange(resStr)}
                  className={cn(
                    "flex-1 min-w-[52px] flex flex-col items-center justify-center gap-1.5 py-3 px-1 rounded-xl transition-all duration-300",
                    "border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
                    isActive
                      ? resAccent.container
                      : "border-transparent text-white/30 hover:text-white/60 hover:bg-white/[0.04]"
                  )}
                >
                  <div className="flex items-end gap-[2.5px] h-[14px]">
                    {[1, 2, 3, 4].map((b) => {
                      const filled = b <= filledBars;
                      return (
                        <div
                          key={b}
                          className={cn(
                            "w-[3px] rounded-[1.5px] transition-all duration-300",
                            filled
                              ? isActive
                                ? resAccent.bar
                                : "bg-white/25"
                              : "bg-white/[0.08]"
                          )}
                          style={{ height: `${b * 3 + 2}px` }}
                        />
                      );
                    })}
                  </div>
                  <span
                    className={cn(
                      "text-[13px] font-bold leading-none transition-colors duration-300",
                      isActive ? resAccent.value : "text-white/40"
                    )}
                  >
                    {res === "max" ? "Máx" : res}
                  </span>
                  <span
                    className={cn(
                      "text-[8px] font-semibold uppercase tracking-[0.1em] transition-colors duration-300",
                      isActive ? resAccent.unit : "text-white/20"
                    )}
                  >
                    {res === "max" ? "disp." : fpsLabel ? `${fpsLabel}fps` : "p"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-[10px] text-white/25 italic ml-0.5 leading-relaxed">
        Se utilizará la mejor alternativa si la resolución exacta no está disponible.
      </p>
    </div>
  );
}
