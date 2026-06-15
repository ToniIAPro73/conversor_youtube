"use client";

import { Music, Video, FileText, Image as ImageIcon, FileArchive, Table2, FileType } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CapabilityLossProfile } from "@/lib/domain/unified-analysis";

// Loss profile indicator colors
const LOSS_PROFILE_DOT: Record<CapabilityLossProfile, string> = {
  lossless: "bg-emerald-400",
  "metadata-risk": "bg-amber-400",
  "layout-risk": "bg-orange-400",
  lossy: "bg-red-400",
  experimental: "bg-purple-400",
};

// Category icon mapping for format options
const FORMAT_ICON_MAP: Record<string, React.ElementType> = {
  // Audio
  mp3: Music, m4a: Music, wav: Music, flac: Music, ogg: Music, aac: Music,
  // Video
  mp4: Video, webm: Video, mkv: Video, avi: Video, mov: Video,
  // Image
  jpg: ImageIcon, jpeg: ImageIcon, png: ImageIcon, webp: ImageIcon, gif: ImageIcon, tiff: ImageIcon,
  // Document
  docx: FileText, doc: FileText, pdf: FileType, rtf: FileText, odt: FileText, txt: FileText,
  // Spreadsheet
  xlsx: Table2, xls: Table2, ods: Table2, csv: Table2,
  // Archive
  zip: FileArchive, "7z": FileArchive, tar: FileArchive, gz: FileArchive,
};

// Format gradient colors
const FORMAT_GRADIENT_MAP: Record<string, { gradient: string; glow: string; border: string; bg: string; text: string; icon: string; dot: string }> = {
  // Audio formats — cyan family
  mp3: { gradient: "from-cyan-500 to-blue-600", glow: "rgba(6,182,212,0.2)", border: "border-cyan-500/30", bg: "bg-gradient-to-br from-cyan-500/15 to-blue-600/10", text: "text-cyan-300", icon: "bg-cyan-500/20", dot: "bg-cyan-400" },
  m4a: { gradient: "from-cyan-500 to-blue-600", glow: "rgba(6,182,212,0.2)", border: "border-cyan-500/30", bg: "bg-gradient-to-br from-cyan-500/15 to-blue-600/10", text: "text-cyan-300", icon: "bg-cyan-500/20", dot: "bg-cyan-400" },
  wav: { gradient: "from-cyan-400 to-teal-500", glow: "rgba(20,184,166,0.2)", border: "border-teal-500/30", bg: "bg-gradient-to-br from-teal-500/15 to-cyan-600/10", text: "text-teal-300", icon: "bg-teal-500/20", dot: "bg-teal-400" },
  flac: { gradient: "from-cyan-400 to-teal-500", glow: "rgba(20,184,166,0.2)", border: "border-teal-500/30", bg: "bg-gradient-to-br from-teal-500/15 to-cyan-600/10", text: "text-teal-300", icon: "bg-teal-500/20", dot: "bg-teal-400" },
  ogg: { gradient: "from-cyan-500 to-blue-600", glow: "rgba(6,182,212,0.2)", border: "border-cyan-500/30", bg: "bg-gradient-to-br from-cyan-500/15 to-blue-600/10", text: "text-cyan-300", icon: "bg-cyan-500/20", dot: "bg-cyan-400" },
  aac: { gradient: "from-cyan-500 to-blue-600", glow: "rgba(6,182,212,0.2)", border: "border-cyan-500/30", bg: "bg-gradient-to-br from-cyan-500/15 to-blue-600/10", text: "text-cyan-300", icon: "bg-cyan-500/20", dot: "bg-cyan-400" },
  // Video formats — violet family
  mp4: { gradient: "from-violet-500 to-purple-600", glow: "rgba(139,92,246,0.2)", border: "border-violet-500/30", bg: "bg-gradient-to-br from-violet-500/15 to-purple-600/10", text: "text-violet-300", icon: "bg-violet-500/20", dot: "bg-violet-400" },
  webm: { gradient: "from-violet-500 to-purple-600", glow: "rgba(139,92,246,0.2)", border: "border-violet-500/30", bg: "bg-gradient-to-br from-violet-500/15 to-purple-600/10", text: "text-violet-300", icon: "bg-violet-500/20", dot: "bg-violet-400" },
  mkv: { gradient: "from-violet-500 to-purple-600", glow: "rgba(139,92,246,0.2)", border: "border-violet-500/30", bg: "bg-gradient-to-br from-violet-500/15 to-purple-600/10", text: "text-violet-300", icon: "bg-violet-500/20", dot: "bg-violet-400" },
  // Image formats — pink/rose family
  jpg: { gradient: "from-pink-500 to-rose-600", glow: "rgba(236,72,153,0.2)", border: "border-pink-500/30", bg: "bg-gradient-to-br from-pink-500/15 to-rose-600/10", text: "text-pink-300", icon: "bg-pink-500/20", dot: "bg-pink-400" },
  png: { gradient: "from-pink-500 to-rose-600", glow: "rgba(236,72,153,0.2)", border: "border-pink-500/30", bg: "bg-gradient-to-br from-pink-500/15 to-rose-600/10", text: "text-pink-300", icon: "bg-pink-500/20", dot: "bg-pink-400" },
  gif: { gradient: "from-pink-500 to-rose-600", glow: "rgba(236,72,153,0.2)", border: "border-pink-500/30", bg: "bg-gradient-to-br from-pink-500/15 to-rose-600/10", text: "text-pink-300", icon: "bg-pink-500/20", dot: "bg-pink-400" },
  // Document formats — orange/amber family
  pdf: { gradient: "from-red-500 to-orange-600", glow: "rgba(239,68,68,0.2)", border: "border-red-500/30", bg: "bg-gradient-to-br from-red-500/15 to-orange-600/10", text: "text-red-300", icon: "bg-red-500/20", dot: "bg-red-400" },
  docx: { gradient: "from-orange-500 to-amber-600", glow: "rgba(249,115,22,0.2)", border: "border-orange-500/30", bg: "bg-gradient-to-br from-orange-500/15 to-amber-600/10", text: "text-orange-300", icon: "bg-orange-500/20", dot: "bg-orange-400" },
  // Data formats — cyan/teal family
  json: { gradient: "from-teal-500 to-cyan-600", glow: "rgba(20,184,166,0.2)", border: "border-teal-500/30", bg: "bg-gradient-to-br from-teal-500/15 to-cyan-600/10", text: "text-teal-300", icon: "bg-teal-500/20", dot: "bg-teal-400" },
  csv: { gradient: "from-emerald-500 to-green-600", glow: "rgba(16,185,129,0.2)", border: "border-emerald-500/30", bg: "bg-gradient-to-br from-emerald-500/15 to-green-600/10", text: "text-emerald-300", icon: "bg-emerald-500/20", dot: "bg-emerald-400" },
  // Archive formats — yellow family
  zip: { gradient: "from-yellow-500 to-amber-600", glow: "rgba(234,179,8,0.2)", border: "border-yellow-500/30", bg: "bg-gradient-to-br from-yellow-500/15 to-amber-600/10", text: "text-yellow-300", icon: "bg-yellow-500/20", dot: "bg-yellow-400" },
  "7z": { gradient: "from-yellow-500 to-amber-600", glow: "rgba(234,179,8,0.2)", border: "border-yellow-500/30", bg: "bg-gradient-to-br from-yellow-500/15 to-amber-600/10", text: "text-yellow-300", icon: "bg-yellow-500/20", dot: "bg-yellow-400" },
};

// Default gradient for unlisted formats
const DEFAULT_GRADIENT = {
  gradient: "from-slate-500 to-gray-600",
  glow: "rgba(100,116,139,0.2)",
  border: "border-slate-500/30",
  bg: "bg-gradient-to-br from-slate-500/15 to-gray-600/10",
  text: "text-slate-300",
  icon: "bg-slate-500/20",
  dot: "bg-slate-400",
};

export interface FormatOption {
  value: string;
  label: string;
  sub: string;
  lossProfile: CapabilityLossProfile;
}

interface FormatSelectorProps {
  format: string;
  onFormatChange: (format: string) => void;
  options: FormatOption[];
}

export function FormatSelector({ format, onFormatChange, options }: FormatSelectorProps) {
  return (
    <div className="space-y-2.5">
      <label className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/35 ml-0.5">
        Selecciona el formato
      </label>

      <div className="flex gap-2 p-1.5 bg-white/[0.025] border border-white/[0.06] rounded-2xl backdrop-blur-sm overflow-x-auto max-w-full">
        {options.map((opt) => {
          const isActive = format === opt.value;
          const g = FORMAT_GRADIENT_MAP[opt.value] ?? DEFAULT_GRADIENT;
          const Icon = FORMAT_ICON_MAP[opt.value] ?? FileText;
          const lossDot = LOSS_PROFILE_DOT[opt.lossProfile] ?? "bg-gray-400";

          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onFormatChange(opt.value)}
              className={cn(
                "relative flex items-center gap-3 px-3 sm:px-4 py-3 min-h-[44px] rounded-xl transition-all duration-300 overflow-hidden flex-shrink-0",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 motion-reduce:transition-none",
                isActive
                  ? [g.bg, "border", g.border]
                  : "border border-transparent hover:bg-white/[0.04] text-white/35 hover:text-white/60"
              )}
              style={
                isActive
                  ? { boxShadow: `0 0 24px ${g.glow}, inset 0 1px 0 rgba(255,255,255,0.08)` }
                  : undefined
              }
            >
              {/* Icon container */}
              <div
                className={cn(
                  "h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-300",
                  isActive ? g.icon : "bg-white/[0.05]"
                )}
              >
                <Icon
                  className={cn(
                    "h-5 w-5 transition-colors duration-300",
                    isActive ? g.text : "text-white/30"
                  )}
                />
              </div>

              {/* Label */}
              <div className="text-left">
                <div
                  className={cn(
                    "text-sm font-bold tracking-tight transition-colors duration-300",
                    isActive ? "text-white" : "text-white/40"
                  )}
                >
                  {opt.label}
                </div>
                <div
                  className={cn(
                    "text-[10px] font-medium tracking-wide transition-colors duration-300",
                    isActive ? g.text : "text-white/25"
                  )}
                >
                  {opt.sub}
                </div>
              </div>

              {/* Active indicator dot */}
              {isActive && (
                <div className="ml-auto flex-shrink-0 flex items-center gap-1.5">
                  <span
                    className={cn("block h-2 w-2 rounded-full animate-pulse motion-reduce:animate-none", lossDot)}
                    title={opt.lossProfile}
                  />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
