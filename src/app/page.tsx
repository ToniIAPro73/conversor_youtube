"use client";

import { useState, useEffect, useCallback } from "react";
import { Toaster, toast } from "sonner";
import { SourceSelector, type AnalysisResult } from "@/components/converter/source-selector";
import { InputAnalysisCard } from "@/components/converter/input-analysis-card";
import { CompatibilityPanel } from "@/components/converter/compatibility-panel";
import { JobProgressCard } from "@/components/converter/job-progress-card";
import { ArtifactResultCard } from "@/components/converter/artifact-result-card";
import { JobHistory } from "@/components/history/job-history";
import { ToolStatusPanel } from "@/components/diagnostics/tool-status-panel";
import type { ConversionCapability, ConversionPreset } from "@/lib/media/supported-conversions";
import { Layers, History, Stethoscope } from "lucide-react";

type Tab = "convert" | "history" | "diagnostics";

interface JobStatusData {
  jobId: string;
  status: string;
  stage: string;
  progress: number;
  error?: string;
  outputFormat?: string;
  file?: {
    name: string;
    mimeType: string;
    sizeBytes: number;
    quality: string;
    format: string;
  };
  downloadAvailable?: boolean;
}

interface CapabilitiesData {
  capabilities: ConversionCapability[];
  recommended: { operation: string; format: string; preset: string | null } | null;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("convert");

  // Analysis state
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Capabilities state
  const [capabilities, setCapabilities] = useState<CapabilitiesData | null>(null);
  const [selectedCap, setSelectedCap] = useState<ConversionCapability | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<ConversionPreset | null>(null);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);

  // Job state
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatusData | null>(null);
  const [isConverting, setIsConverting] = useState(false);

  // Load capabilities when analysis is complete
  useEffect(() => {
    if (!analysisResult) return;
    const loadCaps = async () => {
      try {
        const res = await fetch("/api/capabilities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ descriptor: analysisResult.descriptor }),
        });
        const data = await res.json();
        setCapabilities(data as CapabilitiesData);

        // Auto-select recommended
        const rec = (data as CapabilitiesData).recommended;
        if (rec) {
          const recCap = (data as CapabilitiesData).capabilities.find(
            (c) => c.operation === rec.operation && c.outputFormat === rec.format
          );
          if (recCap) {
            setSelectedCap(recCap);
            const preset = recCap.presets.find((p) => p.id === rec.preset) ?? recCap.presets[0];
            setSelectedPreset(preset ?? null);
          }
        }
      } catch {
        // ignore — capabilities optional
      }
    };
    void loadCaps();
  }, [analysisResult]);

  // Poll job status
  useEffect(() => {
    if (!jobId || !isConverting) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        const data = await res.json() as JobStatusData;
        setJobStatus(data);
        if (["completed", "failed", "cancelled"].includes(data.status)) {
          setIsConverting(false);
          if (data.status === "failed") toast.error(data.error ?? "La conversión ha fallado");
        }
      } catch {
        // ignore polling error
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [jobId, isConverting]);

  const handleReset = useCallback(() => {
    setAnalysisResult(null);
    setCapabilities(null);
    setSelectedCap(null);
    setSelectedPreset(null);
    setRightsConfirmed(false);
    setJobId(null);
    setJobStatus(null);
    setIsConverting(false);
  }, []);

  const handleCapSelect = (cap: ConversionCapability, preset: ConversionPreset) => {
    setSelectedCap(cap);
    setSelectedPreset(preset);
  };

  const handleStartConversion = async () => {
    if (!analysisResult || !selectedCap || !selectedPreset) return;

    setIsConverting(true);
    setJobStatus({ jobId: "pending", status: "queued", stage: "Iniciando...", progress: 0 });

    try {
      const body: Record<string, unknown> = {
        format: selectedCap.outputFormat,
        quality: selectedPreset.quality,
        rightsConfirmed: true,
        operation: selectedCap.operation,
      };

      if (analysisResult.kind === "remote-url") {
        body.url = analysisResult.normalizedUrl;
      } else {
        body.localFilePath = analysisResult.storedRelativePath;
      }

      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al iniciar");
      setJobId(data.jobId as string);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al iniciar la conversión");
      setIsConverting(false);
      setJobStatus(null);
    }
  };

  const handleCancel = async () => {
    if (!jobId) return;
    try {
      await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
      toast.info("Cancelando...");
    } catch {
      // ignore
    }
  };

  const selectedKey = selectedCap ? `${selectedCap.operation}-${selectedCap.outputFormat}` : null;

  const showWorkspace = analysisResult && !jobStatus;
  const showProgress = !!jobStatus && jobStatus.status !== "completed";
  const showResult = jobStatus?.status === "completed";

  return (
    <div lang="es" className="min-h-screen bg-[#0a0a0c] text-white">
      <Toaster position="top-center" richColors />

      {/* Radial gradient background */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(circle at 50% 0%, rgba(20,40,60,0.35) 0%, transparent 55%)",
        }}
        aria-hidden="true"
      />

      {/* App shell */}
      <div className="relative max-w-2xl mx-auto px-4 pb-24">
        {/* Header */}
        <header className="text-center pt-12 pb-8">
          <div className="inline-flex items-center gap-2.5 mb-5">
            <div className="h-10 w-10 rounded-xl bg-linear-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-white fill-current" aria-hidden="true">
                <path d="M10 15.5v-7l6 3.5-6 3.5z" />
                <path fillRule="evenodd" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0zM5 12a7 7 0 1014 0 7 7 0 00-14 0z" />
              </svg>
            </div>
            <span className="text-xl font-bold tracking-tight">Link2Media</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-2">
            Conversor <span className="text-cyan-400">multimedia local</span>
          </h1>
          <p className="text-white/40 text-sm max-w-sm mx-auto">
            Pega un enlace o sube un archivo. El sistema detecta lo que se puede hacer con él.
          </p>
        </header>

        {/* Navigation tabs */}
        <nav
          aria-label="Secciones de la aplicación"
          className="flex rounded-2xl overflow-hidden border border-white/10 bg-white/4 mb-6"
        >
          {(
            [
              { id: "convert" as Tab, icon: <Layers className="h-4 w-4" />, label: "Convertir" },
              { id: "history" as Tab, icon: <History className="h-4 w-4" />, label: "Historial" },
              { id: "diagnostics" as Tab, icon: <Stethoscope className="h-4 w-4" />, label: "Diagnóstico" },
            ] as const
          ).map(({ id, icon, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              role="tab"
              aria-selected={activeTab === id}
              aria-controls={`panel-${id}`}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${
                activeTab === id
                  ? "bg-white/10 text-white"
                  : "text-white/35 hover:text-white/60"
              }`}
            >
              {icon}
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </nav>

        {/* Convertir panel */}
        <main id="panel-convert" role="tabpanel" aria-label="Panel de conversión" className={activeTab !== "convert" ? "hidden" : ""}>
          <div className="space-y-5">
            {/* Step 1: Source selector */}
            {!analysisResult && !jobStatus && (
              <section aria-labelledby="source-heading">
                <h2 id="source-heading" className="sr-only">Selecciona la fuente</h2>
                <SourceSelector
                  onUrlAnalyzed={(r) => setAnalysisResult(r)}
                  onFileAnalyzed={(r) => setAnalysisResult(r)}
                  isLoading={isLoading}
                  setLoading={setIsLoading}
                />
              </section>
            )}

            {/* Step 2 + 3: Analysis card + compatibility */}
            {showWorkspace && (
              <div className="space-y-5 animate-in fade-in slide-in-from-bottom-3 duration-400">
                <InputAnalysisCard result={analysisResult} onReset={handleReset} />

                {capabilities && capabilities.capabilities.length > 0 && (
                  <section aria-labelledby="compat-heading">
                    <h2 id="compat-heading" className="sr-only">Opciones de conversión</h2>
                    <CompatibilityPanel
                      capabilities={capabilities.capabilities}
                      recommended={capabilities.recommended}
                      onSelect={handleCapSelect}
                      selectedKey={selectedKey}
                    />
                  </section>
                )}

                {selectedCap && (
                  <div className="pt-2 space-y-3 border-t border-white/5">
                    {/* Rights confirmation — only for remote URL */}
                    {analysisResult.kind === "remote-url" && (
                      <div className="flex items-start gap-3">
                        <input
                          id="rights-check"
                          type="checkbox"
                          checked={rightsConfirmed}
                          onChange={(e) => setRightsConfirmed(e.target.checked)}
                          className="mt-1 accent-cyan-500 h-4 w-4"
                        />
                        <label htmlFor="rights-check" className="text-xs text-white/50 cursor-pointer">
                          Confirmo que soy titular del contenido o que dispongo de permiso para descargarlo y convertirlo. Soy responsable de respetar los derechos de autor.
                        </label>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => void handleStartConversion()}
                      disabled={
                        isConverting ||
                        !selectedPreset ||
                        (analysisResult.kind === "remote-url" && !rightsConfirmed)
                      }
                      className="w-full h-13 py-3.5 rounded-xl bg-white text-black font-bold text-sm hover:bg-cyan-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isConverting
                        ? "Procesando..."
                        : `Convertir a ${selectedCap.outputFormat.toUpperCase()} — ${selectedPreset?.label ?? ""}`}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Progress */}
            {showProgress && jobStatus && (
              <section
                aria-live="polite"
                aria-labelledby="progress-heading"
                className="animate-in fade-in duration-300"
              >
                <h2 id="progress-heading" className="sr-only">Progreso de conversión</h2>
                <JobProgressCard
                  jobId={jobStatus.jobId}
                  status={jobStatus.status}
                  stage={jobStatus.stage}
                  progress={jobStatus.progress}
                  error={jobStatus.error}
                  onCancel={handleCancel}
                />
              </section>
            )}

            {/* Step 5: Result */}
            {showResult && jobStatus?.file && (
              <section aria-labelledby="result-heading" className="animate-in fade-in duration-300">
                <h2 id="result-heading" className="sr-only">Resultado</h2>
                <ArtifactResultCard
                  jobId={jobStatus.jobId}
                  fileName={jobStatus.file.name ?? "download"}
                  format={jobStatus.file.format ?? jobStatus.outputFormat ?? ""}
                  mimeType={jobStatus.file.mimeType}
                  sizeBytes={jobStatus.file.sizeBytes}
                  downloadTokenHash={!!jobStatus.downloadAvailable}
                  onReset={handleReset}
                  onViewHistory={() => setActiveTab("history")}
                />
              </section>
            )}
          </div>
        </main>

        {/* History panel */}
        <div id="panel-history" role="tabpanel" aria-label="Panel de historial" className={activeTab !== "history" ? "hidden" : ""}>
          <JobHistory />
        </div>

        {/* Diagnostics panel */}
        <div id="panel-diagnostics" role="tabpanel" aria-label="Panel de diagnóstico" className={activeTab !== "diagnostics" ? "hidden" : ""}>
          <ToolStatusPanel />
        </div>

        {/* Footer */}
        <footer className="mt-20 pt-6 border-t border-white/5 text-center">
          <p className="text-[10px] text-white/20 uppercase tracking-widest">
            Link2Media · Procesamiento 100% local · {new Date().getFullYear()}
          </p>
        </footer>
      </div>
    </div>
  );
}
