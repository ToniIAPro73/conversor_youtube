"use client";

import { useState, useRef, useCallback } from "react";
import { Loader2, Link2, Upload, AlertTriangle } from "lucide-react";
import { INPUT_ACCEPT_ATTR } from "@/lib/domain/format-catalog";

interface SourceSelectorProps {
  onUrlAnalyzed: (result: RemoteAnalysisResult) => void;
  onFileAnalyzed: (result: LocalAnalysisResult | UniversalAnalysisResult) => void;
  isLoading: boolean;
  setLoading: (v: boolean) => void;
}

export interface RemoteAnalysisResult {
  kind: "remote-url";
  title: string;
  channel?: string;
  thumbnailUrl?: string;
  normalizedUrl: string;
  descriptor: MediaDescriptorLite;
}

export interface LocalAnalysisResult {
  kind: "local-media";
  inputId: string;
  originalName: string;
  storedRelativePath: string;
  sizeBytes: number;
  descriptor: MediaDescriptorLite;
}

export interface UniversalAnalysisResult {
  kind: "universal-file";
  inputId: string;
  originalName: string;
  storedRelativePath: string;
  sizeBytes: number;
  descriptor: MediaDescriptorLite;
  universalDescriptor: unknown;
  category: string;
  detectedFormat: string | null;
  confidence: "high" | "medium" | "low";
}

export type AnalysisResult = RemoteAnalysisResult | LocalAnalysisResult | UniversalAnalysisResult;

export interface MediaDescriptorLite {
  container: string | null;
  durationSeconds: number | null;
  sizeBytes: number | null;
  hasAudio: boolean;
  hasVideo: boolean;
  hasSubtitles: boolean;
  audioStreams: AudioStreamLite[];
  videoStreams: VideoStreamLite[];
  subtitleStreams: SubtitleStreamLite[];
}

export interface AudioStreamLite {
  index: number;
  codec: string;
  channels: number | null;
  language: string | null;
  isDefault: boolean;
}

export interface VideoStreamLite {
  index: number;
  codec: string;
  width: number | null;
  height: number | null;
  fps: number | null;
  isDefault: boolean;
}

export interface SubtitleStreamLite {
  index: number;
  codec: string;
  language: string | null;
  isDefault: boolean;
}

type DragState = "idle" | "drag-valid" | "drag-invalid";

export function SourceSelector({ onUrlAnalyzed, onFileAnalyzed, isLoading, setLoading }: SourceSelectorProps) {
  const [tab, setTab] = useState<"url" | "file">("url");
  const [urlInput, setUrlInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState>("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim() || isLoading) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/inputs/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al analizar el enlace");
      onUrlAnalyzed(data as RemoteAnalysisResult);
      setUrlInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  const handleFile = async (file: File) => {
    setError(null);
    setLoading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/inputs/analyze", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al analizar el archivo");

      if (data.kind === "universal-file") {
        // Universal file (non-media): pass full result including universalDescriptor
        onFileAnalyzed({
          kind: "universal-file",
          inputId: data.inputId,
          originalName: data.originalName,
          storedRelativePath: data.storedRelativePath,
          sizeBytes: data.sizeBytes,
          descriptor: {
            container: null,
            durationSeconds: null,
            sizeBytes: data.sizeBytes,
            hasAudio: false,
            hasVideo: false,
            hasSubtitles: false,
            audioStreams: [],
            videoStreams: [],
            subtitleStreams: [],
          },
          universalDescriptor: data.universalDescriptor,
          category: data.category,
          detectedFormat: data.detectedFormat ?? null,
          confidence: data.confidence ?? "medium",
        } satisfies UniversalAnalysisResult);
      } else {
        // Local media file (ffprobe path)
        onFileAnalyzed(data as LocalAnalysisResult);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  const isFileValid = useCallback((file: File): boolean => {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    // Check against the accept attribute extensions
    const acceptExts = INPUT_ACCEPT_ATTR.split(",").map((s) => s.trim().replace(/^\./, ""));
    return acceptExts.includes(ext) || file.type.startsWith("audio/") || file.type.startsWith("video/") || file.type.startsWith("image/");
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.items[0];
    if (file && file.kind === "file") {
      // We can't fully validate during dragover, assume valid
      setDragState("drag-valid");
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragState("idle");
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragState("idle");
    const file = e.dataTransfer.files[0];
    if (file) {
      if (isFileValid(file)) {
        handleFile(file);
      } else {
        setError("Formato de archivo no soportado.");
        setDragState("drag-invalid");
        setTimeout(() => setDragState("idle"), 2000);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFileValid]);

  const dragBorderClass =
    dragState === "drag-valid"
      ? "border-teal-300 bg-teal-400/10"
      : dragState === "drag-invalid"
        ? "border-red-500 bg-red-500/10"
        : "border-white/14 bg-[#15191f] hover:border-teal-200/30 hover:bg-[#1a2027]";

  const dragTextClass =
    dragState === "drag-valid"
      ? "text-teal-200"
      : dragState === "drag-invalid"
        ? "text-red-400"
        : "";

  return (
    <div className="space-y-3 rounded-[22px] border border-white/10 bg-[#1a1e25] p-3 shadow-[0_24px_90px_rgba(0,0,0,0.34)] backdrop-blur">
      {/* Tab switcher */}
      <div className="grid grid-cols-2 gap-2 rounded-[14px] border border-white/10 bg-black/20 p-1.5">
        <button
          type="button"
          onClick={() => setTab("url")}
          aria-label="Introducir un enlace URL"
          className={`flex min-h-11 items-center justify-center gap-2 rounded-[10px] py-2.5 text-sm font-bold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/70 motion-reduce:transition-none ${
            tab === "url"
              ? "bg-stone-100 text-[#101316]"
              : "text-stone-400 hover:scale-[1.03] hover:bg-white/10 hover:text-stone-100 hover:shadow-[0_8px_22px_rgba(255,255,255,0.08),inset_0_1px_0_rgba(255,255,255,0.06)]"
          }`}
        >
          <Link2 className="h-4 w-4" />
          Desde enlace
        </button>
        <button
          type="button"
          onClick={() => setTab("file")}
          aria-label="Subir un archivo local"
          className={`flex min-h-11 items-center justify-center gap-2 rounded-[10px] py-2.5 text-sm font-bold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/70 motion-reduce:transition-none ${
            tab === "file"
              ? "bg-stone-100 text-[#101316]"
              : "text-stone-400 hover:scale-[1.03] hover:bg-white/10 hover:text-stone-100 hover:shadow-[0_8px_22px_rgba(255,255,255,0.08),inset_0_1px_0_rgba(255,255,255,0.06)]"
          }`}
        >
          <Upload className="h-4 w-4" />
          Archivo local
        </button>
      </div>

      {/* URL input */}
      {tab === "url" && (
        <form onSubmit={handleUrlSubmit} className="space-y-2.5">
          <div>
            <label htmlFor="url-input" className="mb-1 block text-xs font-semibold text-stone-300/70">
              Enlace de YouTube
            </label>
            <input
              id="url-input"
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
              className="min-h-11 w-full rounded-xl border border-white/10 bg-[#0b0d10] px-4 py-2.5 text-sm text-stone-100 placeholder:text-stone-600 inset-shadow-sm focus:border-teal-300/40 focus:outline-none focus:ring-2 focus:ring-teal-300/40"
              autoComplete="off"
              disabled={isLoading}
              aria-label="URL de YouTube"
            />
          </div>
          <button
            type="submit"
            disabled={!urlInput.trim() || isLoading}
            className="flex h-11 min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-teal-300 text-sm font-black text-[#071112] shadow-[0_12px_30px_rgba(45,212,191,0.18)] transition-all duration-200 hover:scale-[1.015] hover:shadow-[0_18px_45px_rgba(45,212,191,0.32)] hover:bg-teal-200 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Analizando...
              </>
            ) : (
              "Analizar"
            )}
          </button>
          <p className="text-center text-[10px] text-stone-600">
            Compatible con youtube.com, youtu.be y music.youtube.com
          </p>
        </form>
      )}

      {/* File drop zone */}
      {tab === "file" && (
        <div>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            aria-label="Arrastra un archivo o haz clic para seleccionar audio, vídeo, imágenes, documentos, datos y más"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
            className={`relative cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition-all focus:outline-none focus:ring-2 focus:ring-teal-300/50 motion-reduce:transition-none ${dragBorderClass} ${
              isLoading ? "pointer-events-none opacity-50" : ""
            }`}
          >
            {isLoading ? (
              <div className="flex flex-col items-center gap-2 text-white/60">
                <Loader2 className="h-7 w-7 animate-spin motion-reduce:animate-none" />
                <span className="text-sm">Analizando archivo...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-white/50">
                <Upload className={`h-8 w-8 transition-colors ${dragState === "drag-valid" ? "text-teal-200" : dragState === "drag-invalid" ? "text-red-400" : "text-stone-400"}`} />
                <div>
                  <p className={`text-sm font-medium ${dragTextClass || "text-white/70"}`}>
                    {dragState === "drag-valid"
                      ? "Suelta el archivo aquí"
                      : dragState === "drag-invalid"
                        ? "Formato no soportado"
                        : "Arrastra o haz clic para seleccionar"}
                  </p>
                  <p className="mt-0.5 text-xs text-stone-400">Audio, vídeo, imágenes, documentos, datos y más</p>
                  <p className="text-[10px] text-stone-500">Tamaño máximo: 2 GB</p>
                </div>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              className="sr-only"
              accept={INPUT_ACCEPT_ATTR}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
              aria-label="Seleccionar archivo local"
            />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-start gap-2.5 rounded-xl bg-red-500/10 border border-red-500/20 p-3.5 text-red-400 text-sm"
        >
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
