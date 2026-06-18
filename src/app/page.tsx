"use client";

import { useState, useEffect, useCallback } from "react";
import { Toaster, toast } from "sonner";
import { SourceSelector, type AnalysisResult, type UniversalAnalysisResult } from "@/components/converter/source-selector";
import { InputAnalysisCard } from "@/components/converter/input-analysis-card";
import { CompatibilityPanel } from "@/components/converter/compatibility-panel";
import { JobProgressCard } from "@/components/converter/job-progress-card";
import { ArtifactResultCard } from "@/components/converter/artifact-result-card";
import { JobHistory } from "@/components/history/job-history";
import { ToolStatusPanel } from "@/components/diagnostics/tool-status-panel";
import { WebModeConverter } from "@/components/converter/web-mode-converter";
import type { CapabilityInfo } from "@/lib/domain/unified-analysis";
import { Layers, History, Stethoscope, CheckCircle2, ArrowRight } from "lucide-react";
import Image from "next/image";
import { t } from "@/i18n";

type Tab = "convert" | "history" | "diagnostics";

// Step-by-step flow states
type FlowStep = "source" | "analysis" | "format" | "confirm" | "progress" | "result";

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
  capabilities: CapabilityInfo[];
  recommended: CapabilityInfo | null;
  inputFormat: string;
  inputCategory: string;
}

export default function Home() {
  const isWebMode = process.env.NEXT_PUBLIC_ANCLORA_FILESTUDIO_MODE === "vercel-web";
  const [activeTab, setActiveTab] = useState<Tab>("convert");

  // Flow step
  const [flowStep, setFlowStep] = useState<FlowStep>("source");

  // Analysis state
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Capabilities state
  const [capabilities, setCapabilities] = useState<CapabilitiesData | null>(null);
  const [selectedCap, setSelectedCap] = useState<CapabilityInfo | null>(null);
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
        let body: Record<string, unknown>;
        if (analysisResult.kind === "universal-file") {
          body = { universalDescriptor: (analysisResult as UniversalAnalysisResult).universalDescriptor };
        } else {
          body = { descriptor: analysisResult.descriptor };
        }

        const res = await fetch("/api/capabilities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        const capData = data as CapabilitiesData;
        setCapabilities(capData);

        // Auto-select recommended capability
        const rec = capData.recommended;
        if (rec && rec.state === "available") {
          setSelectedCap(rec);
        } else {
          const firstAvailable = capData.capabilities.find((c) => c.state === "available");
          if (firstAvailable) {
            setSelectedCap(firstAvailable);
          }
        }

        // Move to analysis step, then format after caps loaded
        setFlowStep("analysis");
      } catch {
        // ignore — capabilities optional
      }
    };
    void loadCaps();
  }, [analysisResult]);

  // Advance to format step when capabilities are loaded
  useEffect(() => {
    if (flowStep === "analysis" && capabilities) {
      // Small delay so user sees the analysis card
      const timer = setTimeout(() => setFlowStep("format"), 400);
      return () => clearTimeout(timer);
    }
  }, [flowStep, capabilities]);

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
          if (data.status === "completed") setFlowStep("result");
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
    setRightsConfirmed(false);
    setJobId(null);
    setJobStatus(null);
    setIsConverting(false);
    setFlowStep("source");
  }, []);

  const handleCapSelect = (cap: CapabilityInfo) => {
    setSelectedCap(cap);
  };

  const handleStartConversion = async () => {
    if (!analysisResult || !selectedCap) return;

    setIsConverting(true);
    setFlowStep("progress");
    setJobStatus({ jobId: "pending", status: "queued", stage: t("progress.queued"), progress: 0 });

    try {
      const body: Record<string, unknown> = {
        rightsConfirmed: true,
      };

      if (analysisResult.kind === "universal-file") {
        body.capabilityId = selectedCap.id;
        body.inputId = (analysisResult as UniversalAnalysisResult).inputId;
        body.format = selectedCap.outputFormat;
      } else if (analysisResult.kind === "remote-url") {
        body.url = analysisResult.normalizedUrl;
        body.format = selectedCap.outputFormat;
        body.quality = "5";
      } else {
        body.localFilePath = analysisResult.storedRelativePath;
        body.format = selectedCap.outputFormat;
        body.quality = "5";
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
      setFlowStep("format");
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

  const selectedKey = selectedCap ? selectedCap.id : null;

  // Step indicator for the conversion flow
  const steps: { key: FlowStep; label: string; num: number }[] = [
    { key: "source", label: "Fuente", num: 1 },
    { key: "analysis", label: "Análisis", num: 2 },
    { key: "format", label: "Formato", num: 3 },
    { key: "confirm", label: "Confirmar", num: 4 },
    { key: "progress", label: "Progreso", num: 5 },
    { key: "result", label: "Resultado", num: 6 },
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === flowStep);
  const needsRights = analysisResult?.kind === "remote-url";

  if (isWebMode) {
    return (
      <div lang="es" className="min-h-screen bg-[#0d0f12] text-[#f4f1ea]">
        <WebModeConverter />
      </div>
    );
  }

  return (
    <div lang="es" className="min-h-screen overflow-hidden bg-[#0d0f12] text-[#f4f1ea]">
      <Toaster position="top-center" richColors />

      <div
        className="fixed inset-0 pointer-events-none opacity-95"
        style={{
          background:
            "radial-gradient(circle at 18% 4%, rgba(13,148,136,0.22) 0%, transparent 34%), radial-gradient(circle at 82% 0%, rgba(198,132,38,0.16) 0%, transparent 28%), linear-gradient(180deg, #12161b 0%, #08090b 72%)",
        }}
        aria-hidden="true"
      />
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.55) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.55) 1px, transparent 1px)",
          backgroundSize: "42px 42px",
        }}
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-3xl px-4 pb-8 sm:px-6">
        <header className="pt-6 pb-5 flex flex-col items-center text-center">
          {/* Logo centrado */}
          <div className="mb-4 flex items-center justify-center">
            <Image
              src="/brand/logo-anclora-fileStudio.webp"
              alt="Anclora FileStudio"
              width={72}
              height={72}
              priority
              className="drop-shadow-[0_0_24px_rgba(20,184,166,0.35)]"
            />
          </div>

          <h1 className="max-w-xl text-balance text-[2.4rem] font-black leading-[0.93] tracking-tight sm:text-5xl">
            Anclora{" "}
            <span className="bg-linear-to-r from-teal-300 to-teal-400 bg-clip-text text-transparent">FileStudio</span>
          </h1>
          <p className="mt-3 max-w-sm text-pretty text-sm leading-6 text-stone-400">
            Tu centro de mando local para transformar, optimizar y automatizar cualquier formato de archivo al instante.
          </p>
        </header>

        <nav
          aria-label="Secciones de la aplicación"
          className="mb-4 grid grid-cols-3 gap-2 rounded-[18px] border border-white/8 bg-[#13161b]/90 p-1.5 shadow-[0_24px_80px_rgba(0,0,0,0.40)] backdrop-blur-md"
        >
          {(
            [
              {
                id: "convert" as Tab,
                icon: <Layers className="h-4 w-4" />,
                label: t("nav.convert"),
                activeClass: "bg-teal-400/18 text-teal-200 shadow-[0_0_24px_rgba(45,212,191,0.18)] ring-1 ring-teal-300/25",
                inactiveClass: "bg-teal-400/6 text-teal-300/60 ring-1 ring-teal-300/10 hover:scale-[1.03] hover:bg-teal-400/14 hover:text-teal-200 hover:ring-teal-300/22 hover:shadow-[0_8px_28px_rgba(45,212,191,0.22),inset_0_1px_0_rgba(45,212,191,0.08)]",
              },
              {
                id: "history" as Tab,
                icon: <History className="h-4 w-4" />,
                label: t("nav.history"),
                activeClass: "bg-amber-400/15 text-amber-200 shadow-[0_0_24px_rgba(251,191,36,0.16)] ring-1 ring-amber-300/25",
                inactiveClass: "bg-amber-400/6 text-amber-300/60 ring-1 ring-amber-300/10 hover:scale-[1.03] hover:bg-amber-400/14 hover:text-amber-200 hover:ring-amber-300/22 hover:shadow-[0_8px_28px_rgba(251,191,36,0.22),inset_0_1px_0_rgba(251,191,36,0.08)]",
              },
              {
                id: "diagnostics" as Tab,
                icon: <Stethoscope className="h-4 w-4" />,
                label: t("nav.diagnostics"),
                activeClass: "bg-violet-400/15 text-violet-200 shadow-[0_0_24px_rgba(167,139,250,0.16)] ring-1 ring-violet-300/25",
                inactiveClass: "bg-violet-400/6 text-violet-300/60 ring-1 ring-violet-300/10 hover:scale-[1.03] hover:bg-violet-400/14 hover:text-violet-200 hover:ring-violet-300/22 hover:shadow-[0_8px_28px_rgba(167,139,250,0.22),inset_0_1px_0_rgba(167,139,250,0.08)]",
              },
            ] as const
          ).map(({ id, icon, label, activeClass, inactiveClass }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              role="tab"
              aria-selected={activeTab === id}
              aria-controls={`panel-${id}`}
              className={`flex min-h-12 items-center justify-center gap-2 rounded-[14px] px-2 py-3 text-sm font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/70 motion-reduce:transition-none ${
                activeTab === id ? activeClass : inactiveClass
              }`}
            >
              {icon}
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </nav>

        {/* Convertir panel */}
        <main id="panel-convert" role="tabpanel" aria-label="Panel de conversión" className={activeTab !== "convert" ? "hidden" : ""}>
          <div className="space-y-3">
            {/* Step indicator — only show after source step */}
            {flowStep !== "source" && (
              <div className="flex items-center gap-1 overflow-x-auto pb-1 motion-reduce:transition-none" aria-label="Pasos de conversión">
                {steps.map((step, i) => {
                  const isCompleted = i < currentStepIndex;
                  const isCurrent = i === currentStepIndex;
                  // Skip confirm step if no rights needed
                  if (step.key === "confirm" && !needsRights) return null;

                  return (
                    <div key={step.key} className="flex items-center gap-1 shrink-0">
                      {i > 0 && (step.key !== "confirm" || needsRights) && (
                        <ArrowRight className="h-3 w-3 text-white/15 shrink-0" aria-hidden="true" />
                      )}
                      <div
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-medium transition-colors motion-reduce:transition-none ${
                          isCurrent
                            ? "bg-teal-400/15 text-teal-200 ring-1 ring-teal-300/20"
                            : isCompleted
                              ? "bg-emerald-400/10 text-emerald-300"
                              : "text-stone-500"
                        }`}
                      >
                        {isCompleted ? (
                          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <span className="h-3 w-3 flex items-center justify-center text-[9px]">{step.num}</span>
                        )}
                        <span className="hidden sm:inline">{step.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Step 1: Source selector */}
            {flowStep === "source" && (
              <section aria-labelledby="source-heading" className="animate-in fade-in slide-in-from-bottom-3 duration-400 motion-reduce:animate-none">
                <h2 id="source-heading" className="sr-only">Selecciona la fuente</h2>
                <SourceSelector
                  onUrlAnalyzed={(r) => setAnalysisResult(r)}
                  onFileAnalyzed={(r) => setAnalysisResult(r)}
                  isLoading={isLoading}
                  setLoading={setIsLoading}
                />
              </section>
            )}

            {/* Step 2: Analysis card */}
            {(flowStep === "analysis" || flowStep === "format" || flowStep === "confirm") && analysisResult && (
              <div className="space-y-5 animate-in fade-in slide-in-from-bottom-3 duration-400 motion-reduce:animate-none">
                <InputAnalysisCard result={analysisResult} onReset={handleReset} />

                {/* Step 3: Format selector / Compatibility panel */}
                {(flowStep === "format" || flowStep === "confirm") && capabilities && capabilities.capabilities.length > 0 && (
                  <section aria-labelledby="compat-heading" className="animate-in fade-in duration-300 motion-reduce:animate-none">
                    <h2 id="compat-heading" className="sr-only">Opciones de conversión</h2>
                    <CompatibilityPanel
                      capabilities={capabilities.capabilities}
                      recommended={capabilities.recommended}
                      onSelect={handleCapSelect}
                      selectedKey={selectedKey}
                    />
                  </section>
                )}

                {/* Step 4: Confirm & start */}
                {(flowStep === "format" || flowStep === "confirm") && selectedCap && (
                  <div className="space-y-3 border-t border-white/8 pt-2 animate-in fade-in duration-300 motion-reduce:animate-none">
                    {/* Rights confirmation — only for remote URL */}
                    {needsRights && (
                      <div className="flex items-start gap-3">
                        <input
                          id="rights-check"
                          type="checkbox"
                          checked={rightsConfirmed}
                          onChange={(e) => {
                            setRightsConfirmed(e.target.checked);
                            if (e.target.checked) setFlowStep("confirm");
                          }}
                          className="mt-1 h-5 min-h-5 w-5 min-w-5 accent-teal-400"
                        />
                        <label htmlFor="rights-check" className="cursor-pointer text-xs leading-relaxed text-stone-300/70">
                          {t("convert.rights")}. Soy responsable de respetar los derechos de autor.
                        </label>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => void handleStartConversion()}
                      disabled={
                        isConverting ||
                        (needsRights && !rightsConfirmed)
                      }
                      className="h-13 min-h-11 w-full rounded-xl bg-teal-300 px-4 py-3.5 text-sm font-black text-[#071112] shadow-[0_18px_45px_rgba(45,212,191,0.18)] transition-all hover:-translate-y-0.5 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
                    >
                      {isConverting
                        ? "Procesando..."
                        : `${t("convert.start")} → ${selectedCap.outputFormat.toUpperCase()} — ${selectedCap.outputLabel}`}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Step 5: Progress */}
            {flowStep === "progress" && jobStatus && (
              <section
                aria-live="polite"
                aria-labelledby="progress-heading"
                className="animate-in fade-in duration-300 motion-reduce:animate-none"
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

            {/* Step 6: Result */}
            {flowStep === "result" && jobStatus?.file && (
              <section aria-labelledby="result-heading" className="animate-in fade-in duration-300 motion-reduce:animate-none">
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
        <footer className="mt-20 flex flex-col items-center gap-2 border-t border-white/6 pt-8">
          <div className="flex items-center gap-2">
            <span className="h-px w-8 bg-linear-to-r from-transparent to-white/15" />
            <p className="text-[10px] font-medium uppercase tracking-[0.26em] text-stone-600">
              Anclora FileStudio
            </p>
            <span className="h-1 w-1 rounded-full bg-teal-400/40" />
            <p className="text-[10px] font-medium uppercase tracking-[0.26em] text-stone-600">
              100% local
            </p>
            <span className="h-px w-8 bg-linear-to-l from-transparent to-white/15" />
          </div>
          <p className="text-[9px] tracking-widest text-stone-700">{new Date().getFullYear()}</p>
        </footer>
      </div>
    </div>
  );
}
