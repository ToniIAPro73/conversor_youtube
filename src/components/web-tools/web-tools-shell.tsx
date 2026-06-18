"use client";

import Image from "next/image";
import { useState } from "react";
import { Download, HelpCircle } from "lucide-react";
import { ExternalActionLink } from "@/components/web/external-action-link";
import { FILESTUDIO_BRAND } from "@/lib/filestudio-brand";
import { ImageTool } from "./images/image-tool";
import { PdfTool } from "./pdf/pdf-tool";
import { StructuredDataTool } from "./structured/structured-data-tool";
import { PrivacyNotice } from "./privacy-notice";

const windowsUrl = process.env.NEXT_PUBLIC_WINDOWS_DOWNLOAD_URL || "";
const linuxUrl = process.env.NEXT_PUBLIC_LINUX_DOWNLOAD_URL || "";
const supportUrl = process.env.NEXT_PUBLIC_SUPPORT_URL || "";

type ToolTab = "images" | "pdf" | "structured";

export function WebToolsShell() {
  const [tab, setTab] = useState<ToolTab>("images");

  return (
    <div className="min-h-screen bg-[#0d0f12] text-[#f4f1ea]">
      <div
        className="pointer-events-none fixed inset-0 opacity-80"
        style={{
          background:
            "radial-gradient(circle at 12% 6%, rgba(13,148,136,0.16) 0%, transparent 32%), radial-gradient(circle at 88% 4%, rgba(198,132,38,0.10) 0%, transparent 26%), linear-gradient(180deg, #12161b 0%, #08090b 70%)",
        }}
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-5xl px-4 pb-16 sm:px-6">
        <header className="pt-8 pb-6 text-center">
          <div className="mb-4 flex justify-center">
            <Image src={FILESTUDIO_BRAND.logoPath} alt={FILESTUDIO_BRAND.name} width={72} height={72} priority className="drop-shadow-[0_0_24px_rgba(20,184,166,0.35)]" />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <h1 className="text-[2rem] font-black leading-tight tracking-tight sm:text-4xl">
              Anclora <span className="bg-linear-to-r from-teal-300 to-teal-400 bg-clip-text text-transparent">FileStudio</span>
            </h1>
            <span className="rounded-full bg-teal-400/15 px-2.5 py-0.5 text-xs font-semibold text-teal-300 ring-1 ring-teal-300/25">
              Versión Web
            </span>
          </div>
          <p className="mx-auto mt-3 max-w-2xl text-pretty text-sm leading-6 text-stone-400">
            Prepara imágenes y organiza PDF directamente en tu navegador. Para motores nativos y conversiones avanzadas, usa la versión Desktop.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <ExternalActionLink url={windowsUrl} label="Windows" icon={<Download className="h-4 w-4" aria-hidden="true" />} disabledTooltip="Descarga próximamente" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-stone-100 px-4 text-sm font-bold text-[#101316]" />
            <ExternalActionLink url={linuxUrl} label="Linux" icon={<Download className="h-4 w-4" aria-hidden="true" />} disabledTooltip="Descarga próximamente" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-white/14 px-4 text-sm font-bold text-stone-100" />
            <ExternalActionLink url={supportUrl} label="Ayuda" icon={<HelpCircle className="h-4 w-4" aria-hidden="true" />} disabledTooltip="Soporte aún no configurado" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-white/10 px-4 text-sm font-medium text-stone-400" />
          </div>
        </header>

        <main className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2">
            <button type="button" onClick={() => setTab("images")} className={`rounded-lg border p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60 ${tab === "images" ? "border-teal-300/40 bg-teal-400/8" : "border-white/10 bg-white/3"}`}>
              <h2 className="text-lg font-black text-stone-100">Preparar imágenes</h2>
              <p className="mt-1 text-sm leading-6 text-stone-400">Convierte, comprime, cambia el tamaño y elimina metadatos privados.</p>
            </button>
            <button type="button" onClick={() => setTab("pdf")} className={`rounded-lg border p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60 ${tab === "pdf" ? "border-teal-300/40 bg-teal-400/8" : "border-white/10 bg-white/3"}`}>
              <h2 className="text-lg font-black text-stone-100">Organizar PDF</h2>
              <p className="mt-1 text-sm leading-6 text-stone-400">Une, divide, ordena y gira páginas, o crea PDF desde imágenes.</p>
            </button>
          </div>

          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Herramientas Web">
            <ToolButton active={tab === "images"} onClick={() => setTab("images")}>Imágenes</ToolButton>
            <ToolButton active={tab === "pdf"} onClick={() => setTab("pdf")}>PDF</ToolButton>
            <ToolButton active={tab === "structured"} onClick={() => setTab("structured")}>Más herramientas</ToolButton>
          </div>

          <section className="rounded-lg border border-white/10 bg-[#13161b]/80 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.32)] backdrop-blur-md sm:p-5">
            {tab === "images" && <ImageTool />}
            {tab === "pdf" && <PdfTool />}
            {tab === "structured" && <StructuredDataTool />}
          </section>

          <PrivacyNotice />
        </main>
      </div>
    </div>
  );
}

function ToolButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`min-h-11 rounded-md px-4 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60 ${active ? "bg-teal-300 text-[#071112]" : "border border-white/12 text-stone-300 hover:bg-white/6"}`}
    >
      {children}
    </button>
  );
}
