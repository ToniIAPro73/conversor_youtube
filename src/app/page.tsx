"use client";

import { useState, useEffect, useMemo } from "react";
import { UrlForm } from "@/components/converter/url-form";
import { MediaPreview } from "@/components/converter/media-preview";
import { FormatSelector } from "@/components/converter/format-selector";
import { QualitySelector } from "@/components/converter/quality-selector";
import { ConversionProgress } from "@/components/converter/conversion-progress";
import { DownloadCard } from "@/components/converter/download-card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { MetadataResponse } from "@/lib/youtube/schemas";
import { toast, Toaster } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";

interface JobStatusData {
  jobId: string;
  status: string;
  stage: string;
  progress: number;
  error?: string;
  file?: {
    name: string;
    mimeType: string;
    sizeBytes: number;
    quality: string;
  };
  downloadToken?: string;
}

export default function Home() {
  const [metadata, setMetadata] = useState<MetadataResponse | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const [format, setFormat] = useState<"mp3" | "mp4">("mp3");
  const [selectedQuality, setSelectedQuality] = useState<string | null>(null);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatusData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dependencyError, setDependencyError] = useState<string | null>(null);

  // Derived quality if not manually selected
  const quality = useMemo(() => {
    if (selectedQuality) return selectedQuality;
    if (format === "mp3") return "192";
    if (metadata) {
      return metadata.availableHeights.includes(720) ? "720" : metadata.availableHeights[0]?.toString() || "360";
    }
    return "192";
  }, [selectedQuality, format, metadata]);

  // Poll for job status
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (jobId && isProcessing) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/jobs/${jobId}`);
          if (!res.ok) throw new Error("Error al obtener el estado");
          const data = await res.json() as JobStatusData;
          setJobStatus(data);
          
          if (["completed", "failed", "cancelled"].includes(data.status)) {
            setIsProcessing(false);
            if (data.status === "failed") {
              toast.error(data.error || "La conversión ha fallado");
            }
          }
        } catch (error) {
          console.error("Polling error:", error);
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [jobId, isProcessing]);

  const handleAnalyze = async (inputUrl: string) => {
    setIsAnalyzing(true);
    setMetadata(null);
    setJobId(null);
    setJobStatus(null);
    setSelectedQuality(null);
    setDependencyError(null);
    
    try {
      const res = await fetch("/api/metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: inputUrl }),
      });
      
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "DEPENDENCY_MISSING") {
          setDependencyError(data.error);
        }
        throw new Error(data.error || "Error al analizar");
      }
      
      setMetadata(data);
    } catch (error: unknown) {
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error("Ocurrió un error inesperado al analizar el enlace.");
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleStartConversion = async () => {
    if (!metadata || !rightsConfirmed) return;
    
    setIsProcessing(true);
    setJobStatus({ 
      jobId: "pending",
      status: "queued", 
      stage: "Iniciando...", 
      progress: 0 
    });

    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId: metadata.videoId,
          format,
          quality,
          rightsConfirmed,
        }),
      });
      
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "DEPENDENCY_MISSING") {
          setDependencyError(data.error);
        }
        throw new Error(data.error || "Error al iniciar");
      }
      
      setJobId(data.jobId);
    } catch (error: unknown) {
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error("Ocurrió un error inesperado al iniciar la conversión.");
      }
      setIsProcessing(false);
      setJobStatus(null);
    }
  };

  const handleReset = () => {
    setMetadata(null);
    setJobId(null);
    setJobStatus(null);
    setIsProcessing(false);
    setRightsConfirmed(false);
    setSelectedQuality(null);
    setDependencyError(null);
  };

  return (
    <main className="min-h-screen bg-[#0a0a0c] text-white selection:bg-cyan-500/30">
      <Toaster position="top-center" expand={false} richColors />
      
      {/* Radial Gradient Background */}
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(20,40,60,0.4)_0%,transparent_50%)] pointer-events-none" />

      <div className="relative max-w-3xl mx-auto px-6 pt-16 pb-24">
        {/* Header */}
        <header className="text-center mb-12">
          <div className="inline-flex items-center gap-2 mb-4 group cursor-default">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 group-hover:scale-105 transition-transform">
              <svg viewBox="0 0 24 24" className="h-6 w-6 text-white fill-current">
                <path d="M10 15.5v-7l6 3.5-6 3.5z" />
                <path fillRule="evenodd" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0zM5 12a7 7 0 1014 0 7 7 0 00-14 0z" />
              </svg>
            </div>
            <span className="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
              Link2Media
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold mb-4 tracking-tight">
            Convierte contenido de <span className="text-cyan-400">YouTube</span>
          </h1>
          <p className="text-white/50 text-lg max-w-lg mx-auto">
            Pega un enlace autorizado, selecciona el formato y descarga tu archivo en segundos.
          </p>
        </header>

        <div className="space-y-8">
          {/* URL Input Section */}
          <section>
            <UrlForm onAnalyze={handleAnalyze} isLoading={isAnalyzing} />
            <p className="mt-3 text-[11px] text-white/30 text-center italic">
              Aceptamos enlaces de youtube.com, youtu.be y music.youtube.com
            </p>
          </section>

          {dependencyError && (
            <div className="p-5 bg-red-500/5 border border-red-500/20 rounded-2xl text-red-400 text-sm animate-in zoom-in-95 duration-300">
              <div className="flex items-center gap-2 mb-2 font-bold text-base">
                <AlertTriangle className="h-5 w-5" />
                Error de Configuración del Servidor
              </div>
              <p className="opacity-90 leading-relaxed mb-4">
                {dependencyError}
              </p>
              <div className="p-3 bg-red-500/10 rounded-lg text-[13px] border border-red-500/10">
                <p className="font-semibold mb-1">💡 Solución sugerida:</p>
                Despliega esta aplicación en un servidor con soporte para binarios (Render, Railway, VPS) en lugar de Vercel. Consulta el <strong>README.md</strong> para más detalles.
              </div>
            </div>
          )}

          {metadata && !jobStatus && (
            <section className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <MediaPreview metadata={metadata} onReset={handleReset} />
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <FormatSelector format={format} onFormatChange={(f) => { setFormat(f); setSelectedQuality(null); }} />
                <QualitySelector 
                  format={format} 
                  quality={quality} 
                  onQualityChange={setSelectedQuality}
                  availableHeights={metadata.availableHeights}
                />
              </div>

              <div className="space-y-6 pt-4 border-t border-white/5">
                <div className="flex items-start gap-3">
                  <Checkbox 
                    id="rights" 
                    checked={rightsConfirmed} 
                    onCheckedChange={(checked) => setRightsConfirmed(checked === true)}
                    className="mt-1 border-white/20 data-[state=checked]:bg-cyan-600 data-[state=checked]:border-cyan-600"
                  />
                  <div className="grid gap-1.5 leading-none">
                    <label 
                      htmlFor="rights" 
                      className="text-sm text-white/70 cursor-pointer select-none"
                    >
                      Confirmo que soy titular del contenido o que dispongo de permiso para descargarlo y convertirlo.
                    </label>
                    <p className="text-[10px] text-white/30">
                      Eres responsable de respetar los derechos de autor y las licencias aplicables.
                    </p>
                  </div>
                </div>

                <Button 
                  onClick={handleStartConversion}
                  disabled={!rightsConfirmed || isProcessing}
                  className="w-full h-14 text-lg font-bold bg-white text-black hover:bg-cyan-400 transition-colors disabled:opacity-50"
                >
                  {isProcessing ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    `Convertir a ${format.toUpperCase()}`
                  )}
                </Button>
              </div>
            </section>
          )}

          {/* Progress & Result Section */}
          {jobStatus && (
            <section className="animate-in fade-in duration-500">
              {jobStatus.status === "completed" && jobStatus.file ? (
                <DownloadCard 
                  fileName={jobStatus.file.name}
                  format={format}
                  quality={jobStatus.file.quality}
                  sizeBytes={jobStatus.file.sizeBytes}
                  downloadUrl={`/api/download/${jobId}?token=${jobStatus.downloadToken}`}
                  onReset={handleReset}
                />
              ) : (
                <ConversionProgress 
                  status={jobStatus.status}
                  stage={jobStatus.stage}
                  progress={jobStatus.progress}
                />
              )}
            </section>
          )}
        </div>

        {/* Footer */}
        <footer className="mt-24 pt-8 border-t border-white/5 text-center">
          <p className="text-[10px] text-white/20 uppercase tracking-widest font-medium">
            Link2Media MVP • Versión 0.1.0 • {new Date().getFullYear()}
          </p>
        </footer>
      </div>
    </main>
  );
}
