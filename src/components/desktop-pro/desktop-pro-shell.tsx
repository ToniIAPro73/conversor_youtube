"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Toaster, toast } from "sonner";
import {
  Archive,
  BookOpen,
  CheckCircle2,
  FileText,
  Film,
  History,
  ImageIcon,
  Layers,
  Mic,
  ScanText,
  Stethoscope,
} from "lucide-react";
import { SourceSelector, type AnalysisResult, type UniversalAnalysisResult, type RemoteAnalysisResult } from "@/components/converter/source-selector";
import { InputAnalysisCard } from "@/components/converter/input-analysis-card";
import { CompatibilityPanel } from "@/components/converter/compatibility-panel";
import { QualitySelector } from "@/components/converter/quality-selector";
import { JobProgressCard } from "@/components/converter/job-progress-card";
import { ArtifactResultCard } from "@/components/converter/artifact-result-card";
import { JobHistory } from "@/components/history/job-history";
import { ToolStatusPanel } from "@/components/diagnostics/tool-status-panel";
import { ImageTool } from "@/components/web-tools/images/image-tool";
import { PdfTool } from "@/components/web-tools/pdf/pdf-tool";
import { StructuredDataTool } from "@/components/web-tools/structured/structured-data-tool";
import type { CapabilityInfo } from "@/lib/domain/unified-analysis";
import type { VideoFormat } from "@/lib/media/metadata";
import { VideoQualitySelectionSchema, type QualityProfile } from "@/lib/quality/quality-contract";
import { DESKTOP_PRO_GROUPS, type DesktopProGroupId } from "@/lib/capabilities/desktop-capabilities";
import { FILESTUDIO_BRAND } from "@/lib/filestudio-brand";
import { t } from "@/i18n";

type DesktopTab = DesktopProGroupId | "history" | "diagnostics";
type FlowStep = "source" | "analysis" | "format" | "progress" | "result";

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

const TAB_ICONS: Record<DesktopTab, React.ReactNode> = {
  images: <ImageIcon className="h-4 w-4" />,
  pdf: <FileText className="h-4 w-4" />,
  media: <Film className="h-4 w-4" />,
  documents: <Layers className="h-4 w-4" />,
  ocr: <ScanText className="h-4 w-4" />,
  archives: <Archive className="h-4 w-4" />,
  ebooks: <BookOpen className="h-4 w-4" />,
  structured: <Mic className="h-4 w-4 rotate-90" />,
  history: <History className="h-4 w-4" />,
  diagnostics: <Stethoscope className="h-4 w-4" />,
};

export function DesktopProShell() {
  const [activeTab, setActiveTab] = useState<DesktopTab>("images");
  const [flowStep, setFlowStep] = useState<FlowStep>("source");
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [capabilities, setCapabilities] = useState<CapabilitiesData | null>(null);
  const [selectedCap, setSelectedCap] = useState<CapabilityInfo | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatusData | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [qualityProfile, setQualityProfile] = useState<QualityProfile>("source-max");
  const [quality, setQuality] = useState<string>("max");
  const [videoFormats, setVideoFormats] = useState<VideoFormat[]>([]);

  const activeGroup = DESKTOP_PRO_GROUPS.find((group) => group.id === activeTab);
  const selectedKey = selectedCap ? selectedCap.id : null;
  const nativeTab = activeTab !== "history" && activeTab !== "diagnostics";

  const steps = useMemo(
    () => [
      { key: "source" as FlowStep, label: "Fuente", num: 1 },
      { key: "analysis" as FlowStep, label: "Análisis", num: 2 },
      { key: "format" as FlowStep, label: "Formato", num: 3 },
      { key: "progress" as FlowStep, label: "Progreso", num: 4 },
      { key: "result" as FlowStep, label: "Resultado", num: 5 },
    ],
    []
  );

  const currentStepIndex = steps.findIndex((step) => step.key === flowStep);

  useEffect(() => {
    if (!analysisResult) return;
    const loadCaps = async () => {
      try {
        const body: Record<string, unknown> = analysisResult.kind === "universal-file"
          ? { universalDescriptor: (analysisResult as UniversalAnalysisResult).universalDescriptor }
          : { descriptor: analysisResult.descriptor };

        const response = await fetch("/api/capabilities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await response.json();
        const capData = data as CapabilitiesData;
        setCapabilities(capData);
        const recommended = capData.recommended;
        setSelectedCap(
          recommended?.state === "available"
            ? recommended
            : capData.capabilities.find((cap) => cap.state === "available") ?? null
        );
        setFlowStep("analysis");
      } catch {
        toast.error("No se pudieron calcular las capacidades.");
      }
    };
    void loadCaps();
  }, [analysisResult]);

  useEffect(() => {
    if (flowStep === "analysis" && capabilities) {
      const timer = setTimeout(() => setFlowStep("format"), 300);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [flowStep, capabilities]);

  useEffect(() => {
    if (!jobId || !isConverting) return;
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}`);
        const data = await response.json() as JobStatusData;
        setJobStatus(data);
        if (["completed", "failed", "cancelled"].includes(data.status)) {
          setIsConverting(false);
          if (data.status === "failed") toast.error(data.error ?? "La conversión ha fallado");
          if (data.status === "completed") setFlowStep("result");
        }
      } catch {
        // transient polling failure
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [jobId, isConverting]);

  const resetFlow = useCallback(() => {
    setAnalysisResult(null);
    setCapabilities(null);
    setSelectedCap(null);
    setJobId(null);
    setJobStatus(null);
    setIsConverting(false);
    setFlowStep("source");
    setQualityProfile("source-max");
    setQuality("max");
    setVideoFormats([]);
  }, []);

  const handleTabChange = useCallback((tab: DesktopTab) => {
    setActiveTab(tab);
    resetFlow();
  }, [resetFlow]);

  const handleAnalysisResult = useCallback((result: AnalysisResult) => {
    setAnalysisResult(result);
    if (result.kind === "remote-url") {
      const formats = (result as RemoteAnalysisResult).videoFormats;
      setVideoFormats(Array.isArray(formats) ? formats : []);
    } else {
      setVideoFormats([]);
    }
  }, []);

  const handleStartConversion = async () => {
    if (!analysisResult || !selectedCap) return;

    setIsConverting(true);
    setFlowStep("progress");
    setJobStatus({ jobId: "pending", status: "queued", stage: t("progress.queued"), progress: 0 });

    const isVideoFormat = selectedCap.outputFormat === "mp4" || selectedCap.outputFormat === "mkv" || selectedCap.outputFormat === "webm";
    const qualitySelection = isVideoFormat
      ? VideoQualitySelectionSchema.parse({
          profile: qualityProfile,
          resolutionLimit: quality === "max" ? "max" : Number(quality),
          fallbackPolicy: "reject",
        })
      : undefined;

    try {
      const body: Record<string, unknown> = { rightsConfirmed: true };
      if (analysisResult.kind === "universal-file") {
        body.capabilityId = selectedCap.id;
        body.inputId = (analysisResult as UniversalAnalysisResult).inputId;
        body.format = selectedCap.outputFormat;
      } else if (analysisResult.kind === "remote-url") {
        body.url = analysisResult.normalizedUrl;
        body.format = selectedCap.outputFormat;
        if (qualitySelection) body.quality = qualitySelection;
      } else {
        body.localFilePath = analysisResult.storedRelativePath;
        body.format = selectedCap.outputFormat;
        if (qualitySelection) body.quality = qualitySelection;
      }

      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Error al iniciar");
      setJobId(data.jobId as string);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al iniciar la conversión");
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
      // no-op
    }
  };

  return (
    <div lang="es" className="min-h-screen overflow-hidden bg-[#0d0f12] text-[#f4f1ea]">
      <Toaster position="top-center" richColors />
      <Background />

      <div className="relative mx-auto max-w-6xl px-4 pb-10 sm:px-6">
        <header className="pt-6 pb-5 text-center">
          <div className="mb-4 flex justify-center">
            <Image
              src={FILESTUDIO_BRAND.logoPath}
              alt={FILESTUDIO_BRAND.name}
              width={72}
              height={72}
              priority
              className="drop-shadow-[0_0_24px_rgba(20,184,166,0.35)]"
            />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <h1 className="text-[2.25rem] font-black leading-tight tracking-tight sm:text-5xl">
              Anclora <span className="bg-linear-to-r from-teal-300 to-teal-400 bg-clip-text text-transparent">FileStudio</span>
            </h1>
            <span className="rounded-full bg-amber-300/15 px-2.5 py-0.5 text-xs font-semibold text-amber-200 ring-1 ring-amber-300/25">
              Desktop PRO
            </span>
            <span className="rounded-full bg-emerald-300/12 px-2.5 py-0.5 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-300/20">
              100% local
            </span>
          </div>
          <p className="mx-auto mt-3 max-w-2xl text-pretty text-sm leading-6 text-stone-400">
            Todo lo de la Web, más motores nativos, lotes pesados, historial local,
            diagnóstico y portables Windows/Linux.
          </p>
        </header>

        <nav className="mb-5 grid grid-cols-2 gap-2 rounded-lg border border-white/8 bg-[#13161b]/90 p-2 shadow-[0_24px_80px_rgba(0,0,0,0.36)] sm:grid-cols-5 lg:grid-cols-10" aria-label="Herramientas Desktop PRO">
          {DESKTOP_PRO_GROUPS.map((group) => (
            <DesktopTabButton
              key={group.id}
              id={group.id}
              active={activeTab === group.id}
              onClick={() => handleTabChange(group.id)}
              label={group.label}
            />
          ))}
          <DesktopTabButton id="history" active={activeTab === "history"} onClick={() => handleTabChange("history")} label="Historial" />
          <DesktopTabButton id="diagnostics" active={activeTab === "diagnostics"} onClick={() => handleTabChange("diagnostics")} label="Diagnóstico" />
        </nav>

        {nativeTab && activeGroup && (
          <section className="mb-5 rounded-lg border border-white/10 bg-[#13161b]/82 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-xl font-black text-stone-100">{activeGroup.label}</h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-400">{activeGroup.description}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {activeGroup.requiredTools.map((tool) => (
                  <span key={tool} className="rounded-md border border-white/10 bg-white/4 px-2.5 py-1 text-xs font-semibold text-stone-300">
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeTab === "images" && <ImageTool />}
        {activeTab === "pdf" && <PdfTool />}
        {activeTab === "structured" && <StructuredDataTool />}
        {nativeTab && activeTab !== "images" && activeTab !== "pdf" && activeTab !== "structured" && (
          <NativeConversionWorkspace
            activeGroup={activeGroup}
            flowStep={flowStep}
            steps={steps}
            currentStepIndex={currentStepIndex}
            analysisResult={analysisResult}
            capabilities={capabilities}
            qualityProfile={qualityProfile}
            quality={quality}
            videoFormats={videoFormats}
            onProfileChange={setQualityProfile}
            onQualityChange={setQuality}
            selectedKey={selectedKey}
            selectedCap={selectedCap}
            isLoading={isLoading}
            isConverting={isConverting}
            jobStatus={jobStatus}
            onFileAnalyzed={handleAnalysisResult}
            onUrlAnalyzed={handleAnalysisResult}
            setLoading={setIsLoading}
            onReset={resetFlow}
            onCapSelect={setSelectedCap}
            onStartConversion={handleStartConversion}
            onCancel={handleCancel}
            onViewHistory={() => handleTabChange("history")}
          />
        )}
        {activeTab === "history" && <Panel><JobHistory /></Panel>}
        {activeTab === "diagnostics" && <Panel><ToolStatusPanel /></Panel>}
      </div>
    </div>
  );
}

function DesktopTabButton({ id, label, active, onClick }: { id: DesktopTab; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex min-h-11 items-center justify-center gap-2 rounded-md px-2 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/70 motion-reduce:transition-none ${
        active ? "bg-teal-300 text-[#071112]" : "border border-white/8 text-stone-300 hover:bg-white/6"
      }`}
    >
      {TAB_ICONS[id]}
      <span>{label}</span>
    </button>
  );
}

function NativeConversionWorkspace(props: {
  activeGroup: typeof DESKTOP_PRO_GROUPS[number] | undefined;
  flowStep: FlowStep;
  steps: Array<{ key: FlowStep; label: string; num: number }>;
  currentStepIndex: number;
  analysisResult: AnalysisResult | null;
  capabilities: CapabilitiesData | null;
  selectedKey: string | null;
  selectedCap: CapabilityInfo | null;
  isLoading: boolean;
  isConverting: boolean;
  jobStatus: JobStatusData | null;
  qualityProfile: QualityProfile;
  quality: string;
  videoFormats: VideoFormat[];
  onProfileChange: (profile: QualityProfile) => void;
  onQualityChange: (quality: string) => void;
  onFileAnalyzed: (result: AnalysisResult) => void;
  onUrlAnalyzed: (result: AnalysisResult) => void;
  setLoading: (loading: boolean) => void;
  onReset: () => void;
  onCapSelect: (capability: CapabilityInfo) => void;
  onStartConversion: () => void;
  onCancel: () => void;
  onViewHistory: () => void;
}) {
  const {
    activeGroup,
    flowStep,
    steps,
    currentStepIndex,
    analysisResult,
    capabilities,
    selectedKey,
    selectedCap,
    isLoading,
    isConverting,
    jobStatus,
    qualityProfile,
    quality,
    videoFormats,
    onProfileChange,
    onQualityChange,
    onFileAnalyzed,
    onUrlAnalyzed,
    setLoading,
    onReset,
    onCapSelect,
    onStartConversion,
    onCancel,
    onViewHistory,
  } = props;

  return (
    <Panel>
      <div className="space-y-4">
        <NativeFeatureSummary group={activeGroup} />
        {flowStep !== "source" && (
          <div className="flex items-center gap-1 overflow-x-auto pb-1" aria-label="Pasos de conversión">
            {steps.map((step, index) => {
              const completed = index < currentStepIndex;
              const current = index === currentStepIndex;
              return (
                <div key={step.key} className={`rounded-md px-2 py-1 text-[11px] font-semibold ${current ? "bg-teal-400/15 text-teal-200" : completed ? "bg-emerald-400/10 text-emerald-200" : "text-stone-500"}`}>
                  {completed ? <CheckCircle2 className="mr-1 inline h-3 w-3" /> : `${step.num}. `}
                  {step.label}
                </div>
              );
            })}
          </div>
        )}

        {flowStep === "source" && (
          <SourceSelector
            onUrlAnalyzed={onUrlAnalyzed}
            onFileAnalyzed={onFileAnalyzed}
            isLoading={isLoading}
            setLoading={setLoading}
          />
        )}

        {(flowStep === "analysis" || flowStep === "format") && analysisResult && (
          <div className="space-y-5">
            <InputAnalysisCard result={analysisResult} onReset={onReset} />
            {flowStep === "format" && capabilities && capabilities.capabilities.length > 0 && (
              <CompatibilityPanel
                capabilities={capabilities.capabilities}
                recommended={capabilities.recommended}
                onSelect={onCapSelect}
                selectedKey={selectedKey}
              />
            )}
            {flowStep === "format" && selectedCap && (selectedCap.outputFormat === "mp4" || selectedCap.outputFormat === "mkv" || selectedCap.outputFormat === "webm") && (
              <QualitySelector
                format="mp4"
                quality={quality}
                onQualityChange={onQualityChange}
                availableHeights={analysisResult?.descriptor?.videoStreams?.map((s) => s.height).filter((h): h is number => h !== null) ?? []}
                qualityProfile={qualityProfile}
                onProfileChange={onProfileChange}
                videoFormats={videoFormats.length > 0 ? videoFormats : undefined}
              />
            )}
            {flowStep === "format" && selectedCap && (
              <button
                type="button"
                onClick={() => void onStartConversion()}
                disabled={isConverting}
                className="min-h-11 w-full rounded-md bg-teal-300 px-4 text-sm font-black text-[#071112] disabled:opacity-40"
              >
                {isConverting ? "Procesando..." : `${t("convert.start")} → ${selectedCap.outputFormat.toUpperCase()}`}
              </button>
            )}
          </div>
        )}

        {flowStep === "progress" && jobStatus && (
          <JobProgressCard
            jobId={jobStatus.jobId}
            status={jobStatus.status}
            stage={jobStatus.stage}
            progress={jobStatus.progress}
            error={jobStatus.error}
            onCancel={onCancel}
          />
        )}

        {flowStep === "result" && jobStatus?.file && (
          <ArtifactResultCard
            jobId={jobStatus.jobId}
            fileName={jobStatus.file.name ?? "download"}
            format={jobStatus.file.format ?? jobStatus.outputFormat ?? ""}
            mimeType={jobStatus.file.mimeType}
            sizeBytes={jobStatus.file.sizeBytes}
            downloadTokenHash={Boolean(jobStatus.downloadAvailable)}
            onReset={onReset}
            onViewHistory={onViewHistory}
          />
        )}
      </div>
    </Panel>
  );
}

function NativeFeatureSummary({ group }: { group: typeof DESKTOP_PRO_GROUPS[number] | undefined }) {
  if (!group) return null;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-lg border border-white/8 bg-white/3 p-4">
        <h3 className="text-sm font-bold text-stone-100">Modo rápido local</h3>
        <p className="mt-1 text-sm leading-6 text-stone-400">{group.quickMode}</p>
      </div>
      <div className="rounded-lg border border-amber-300/18 bg-amber-300/8 p-4">
        <h3 className="text-sm font-bold text-amber-100">Modo PRO con motor nativo</h3>
        <p className="mt-1 text-sm leading-6 text-amber-100/80">{group.proMode}</p>
      </div>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-white/10 bg-[#13161b]/82 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.30)] sm:p-5">
      {children}
    </section>
  );
}

function Background() {
  return (
    <>
      <div
        className="pointer-events-none fixed inset-0 opacity-95"
        style={{
          background:
            "radial-gradient(circle at 18% 4%, rgba(13,148,136,0.20) 0%, transparent 34%), radial-gradient(circle at 82% 0%, rgba(198,132,38,0.14) 0%, transparent 28%), linear-gradient(180deg, #12161b 0%, #08090b 72%)",
        }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.55) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.55) 1px, transparent 1px)",
          backgroundSize: "42px 42px",
        }}
        aria-hidden="true"
      />
    </>
  );
}
