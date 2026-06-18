"use client";

import { useMemo, useState, useCallback } from "react";
import Image from "next/image";
import { Download, Monitor, ShieldCheck, ChevronDown, ChevronUp } from "lucide-react";
import { convertStructuredData, type BrowserStructuredFormat } from "@/lib/browser-conversion";
import { BROWSER_CONVERSION_MATRIX, BROWSER_MATRIX_DISPLAY, DESKTOP_REQUIRED_CATEGORIES, getTargetsForFormat } from "@/lib/browser-conversion/capabilities";
import { getExtension, normalizeFormat } from "@/lib/browser-conversion/validators";
import { WebFileDropzone } from "./web-file-dropzone";
import { ExternalActionLink } from "@/components/web/external-action-link";
import { FILESTUDIO_BRAND } from "@/lib/filestudio-brand";

const windowsUrl = process.env.NEXT_PUBLIC_WINDOWS_DOWNLOAD_URL || "";
const linuxUrl = process.env.NEXT_PUBLIC_LINUX_DOWNLOAD_URL || "";
const supportUrl = process.env.NEXT_PUBLIC_SUPPORT_URL || "";

type ConvertState = "idle" | "converting" | "done" | "error";

export function WebModeConverter() {
  const [file, setFile] = useState<File | null>(null);
  const [targetFormat, setTargetFormat] = useState<BrowserStructuredFormat>("json");
  const [convertState, setConvertState] = useState<ConvertState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [showTechnical, setShowTechnical] = useState(false);
  const [showDesktopDetails, setShowDesktopDetails] = useState(false);

  const sourceFormat = useMemo(() => file ? normalizeFormat(getExtension(file.name)) : null, [file]);
  const targets: readonly BrowserStructuredFormat[] = useMemo(
    () => sourceFormat ? getTargetsForFormat(sourceFormat) : [],
    [sourceFormat]
  );

  const handleFileSelected = useCallback((selected: File) => {
    setFile(selected);
    setConvertState("idle");
    setMessage(null);
    setWarnings([]);
    const nextSource = normalizeFormat(getExtension(selected.name));
    if (nextSource) {
      const nextTargets = BROWSER_CONVERSION_MATRIX[nextSource];
      if (nextTargets.length > 0) setTargetFormat(nextTargets[0]);
    }
  }, []);

  const handleFileCleared = useCallback(() => {
    setFile(null);
    setConvertState("idle");
    setMessage(null);
    setWarnings([]);
  }, []);

  const handleConvert = useCallback(async () => {
    if (!file || !sourceFormat || convertState === "converting") return;

    setConvertState("converting");
    setMessage(null);
    setWarnings([]);

    try {
      const text = await file.text();
      const result = convertStructuredData({ fileName: file.name, text, targetFormat });

      const blob = new Blob([result.text], { type: result.mimeType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      setWarnings(result.warnings);
      setConvertState("done");
      setMessage("Conversión completada. Tu archivo se ha convertido en este navegador y ya está listo para descargar.");
    } catch (error) {
      setConvertState("error");
      setMessage(error instanceof Error ? error.message : "No se pudo convertir el archivo.");
    }
  }, [file, sourceFormat, targetFormat, convertState]);

  const handleConvertAnother = useCallback(() => {
    setFile(null);
    setConvertState("idle");
    setMessage(null);
    setWarnings([]);
  }, []);

  const isConverting = convertState === "converting";
  const isDone = convertState === "done";
  const isError = convertState === "error";

  return (
    <div className="min-h-screen bg-[#0d0f12] text-[#f4f1ea]">
      {/* Background accents */}
      <div
        className="pointer-events-none fixed inset-0 opacity-80"
        style={{
          background:
            "radial-gradient(circle at 12% 6%, rgba(13,148,136,0.18) 0%, transparent 32%), radial-gradient(circle at 88% 4%, rgba(198,132,38,0.12) 0%, transparent 26%), linear-gradient(180deg, #12161b 0%, #08090b 70%)",
        }}
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-3xl px-4 pb-16 sm:px-6">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <header className="pt-8 pb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex items-center justify-center">
            <Image
              src={FILESTUDIO_BRAND.logoPath}
              alt={FILESTUDIO_BRAND.name}
              width={72}
              height={72}
              priority
              className="drop-shadow-[0_0_24px_rgba(20,184,166,0.35)]"
            />
          </div>

          <div className="flex items-center gap-3">
            <h1 className="text-[2rem] font-black leading-tight tracking-tight sm:text-4xl">
              Anclora{" "}
              <span className="bg-gradient-to-r from-teal-300 to-teal-400 bg-clip-text text-transparent">
                FileStudio
              </span>
            </h1>
            <span className="rounded-full bg-teal-400/15 px-2.5 py-0.5 text-xs font-semibold text-teal-300 ring-1 ring-teal-300/25">
              Versión Web
            </span>
          </div>

          <p className="mt-3 max-w-md text-pretty text-sm leading-6 text-stone-400">
            Convierte archivos de datos sin instalarlos ni subirlos a Internet.
            Para audio, vídeo, documentos, PDF y otras funciones avanzadas,
            descarga la versión para Windows o Linux.
          </p>

          {/* Download buttons */}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <ExternalActionLink
              url={windowsUrl}
              label="Windows"
              icon={<Download className="h-4 w-4" aria-hidden="true" />}
              disabledTooltip="Descarga próximamente"
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-stone-100 px-4 text-sm font-bold text-[#101316]"
            />
            <ExternalActionLink
              url={linuxUrl}
              label="Linux"
              icon={<Download className="h-4 w-4" aria-hidden="true" />}
              disabledTooltip="Descarga próximamente"
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-white/14 px-4 text-sm font-bold text-stone-100"
            />
            <ExternalActionLink
              url={supportUrl}
              label="Ayuda"
              disabledTooltip="Soporte aún no configurado"
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-white/10 px-4 text-sm font-medium text-stone-400"
            />
          </div>
        </header>

        {/* ── Conversion card ────────────────────────────────────────── */}
        <section
          aria-labelledby="converter-heading"
          className="rounded-2xl border border-white/10 bg-[#13161b]/80 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.40)] backdrop-blur-md"
        >
          <h2 id="converter-heading" className="mb-4 text-base font-bold text-stone-100">
            Convertir archivo
          </h2>

          {/* Dropzone */}
          <WebFileDropzone
            onFileSelected={handleFileSelected}
            onFileCleared={handleFileCleared}
            selectedFile={file}
            disabled={isConverting}
          />

          {/* Format selector (shown after file is picked) */}
          {file && sourceFormat && targets.length > 0 && (
            <div className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="target-format-web"
                  className="mb-1.5 block text-sm font-semibold text-stone-300"
                >
                  Formato de salida
                </label>
                <select
                  id="target-format-web"
                  value={targetFormat}
                  disabled={isConverting}
                  onChange={(e) => setTargetFormat(e.target.value as BrowserStructuredFormat)}
                  className="min-h-11 w-full rounded-md border border-white/14 bg-[#0d1015] px-3 text-sm text-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60 disabled:opacity-50"
                >
                  {targets.map((target) => (
                    <option key={target} value={target}>
                      {target.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>

              {/* Convert button */}
              {!isDone && (
                <button
                  type="button"
                  disabled={isConverting}
                  onClick={() => void handleConvert()}
                  aria-live="polite"
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-teal-300 px-4 text-sm font-black text-[#071112] shadow-[0_12px_32px_rgba(45,212,191,0.18)] transition-all hover:-translate-y-0.5 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
                >
                  {isConverting ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
                      Convirtiendo…
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" aria-hidden="true" />
                      Convertir a {targetFormat.toUpperCase()} y descargar
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Result / error feedback */}
          {message && (
            <div
              role="status"
              aria-live="polite"
              className={`mt-4 rounded-lg border p-3 text-sm ${
                isError
                  ? "border-red-400/30 bg-red-400/8 text-red-300"
                  : "border-emerald-400/25 bg-emerald-400/6 text-emerald-200"
              }`}
            >
              {message}
            </div>
          )}

          {warnings.length > 0 && (
            <ul className="mt-2 space-y-1" aria-label="Avisos de conversión">
              {warnings.map((w) => (
                <li key={w} className="text-xs text-amber-300">
                  ⚠ {w}
                </li>
              ))}
            </ul>
          )}

          {isDone && (
            <button
              type="button"
              onClick={handleConvertAnother}
              className="mt-3 w-full rounded-xl border border-white/12 py-2.5 text-sm font-semibold text-stone-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60"
            >
              Convertir otro archivo
            </button>
          )}
        </section>

        {/* ── Conversion matrix ──────────────────────────────────────── */}
        <section aria-labelledby="matrix-heading" className="mt-6">
          <h2 id="matrix-heading" className="mb-3 text-sm font-semibold uppercase tracking-wider text-stone-500">
            Conversiones disponibles en esta versión Web
          </h2>
          <div className="overflow-x-auto rounded-xl border border-white/8 bg-[#13161b]/60">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8">
                  <th scope="col" className="px-4 py-2.5 text-left font-semibold text-stone-400">Entrada</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-semibold text-stone-400">Salidas</th>
                </tr>
              </thead>
              <tbody>
                {BROWSER_MATRIX_DISPLAY.map(({ input, outputs }) => (
                  <tr key={input} className="border-b border-white/5 last:border-0 hover:bg-white/2">
                    <td className="px-4 py-2 font-medium text-teal-200">{input}</td>
                    <td className="px-4 py-2 text-stone-300">{outputs.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Desktop required ───────────────────────────────────────── */}
        <section aria-labelledby="desktop-heading" className="mt-6">
          <button
            type="button"
            onClick={() => setShowDesktopDetails(!showDesktopDetails)}
            aria-expanded={showDesktopDetails}
            aria-controls="desktop-details"
            className="flex w-full items-center justify-between rounded-xl border border-white/8 bg-[#13161b]/60 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60"
          >
            <div className="flex items-center gap-2">
              <Monitor className="h-4 w-4 text-amber-300" aria-hidden="true" />
              <h2 id="desktop-heading" className="text-sm font-semibold text-stone-200">
                Para estas conversiones necesitas la aplicación Desktop
              </h2>
            </div>
            {showDesktopDetails
              ? <ChevronUp className="h-4 w-4 text-stone-500" aria-hidden="true" />
              : <ChevronDown className="h-4 w-4 text-stone-500" aria-hidden="true" />
            }
          </button>

          {showDesktopDetails && (
            <div
              id="desktop-details"
              className="mt-1 rounded-b-xl border border-t-0 border-white/8 bg-[#13161b]/40 px-4 py-3"
            >
              <dl className="grid gap-3 sm:grid-cols-2">
                {DESKTOP_REQUIRED_CATEGORIES.map(({ label, formats }) => (
                  <div key={label}>
                    <dt className="text-xs font-semibold uppercase tracking-wider text-stone-500">{label}</dt>
                    <dd className="mt-1 text-xs text-stone-400">{formats.join(", ")}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-xs text-stone-500">
                Descarga la versión Desktop para Windows o Linux para acceder a estas conversiones.
              </p>
              <div className="mt-3 flex gap-2">
                <ExternalActionLink
                  url={windowsUrl}
                  label="Descargar para Windows"
                  icon={<Download className="h-3.5 w-3.5" aria-hidden="true" />}
                  disabledTooltip="Descarga próximamente"
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-stone-100 px-3 text-xs font-bold text-[#101316]"
                />
                <ExternalActionLink
                  url={linuxUrl}
                  label="Descargar para Linux"
                  icon={<Download className="h-3.5 w-3.5" aria-hidden="true" />}
                  disabledTooltip="Descarga próximamente"
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/12 px-3 text-xs font-bold text-stone-200"
                />
              </div>
            </div>
          )}
        </section>

        {/* ── Privacy section ────────────────────────────────────────── */}
        <section
          aria-labelledby="privacy-heading"
          className="mt-6 rounded-xl border border-white/8 bg-[#13161b]/60 p-4"
        >
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" aria-hidden="true" />
            <div className="flex-1">
              <h2 id="privacy-heading" className="text-sm font-semibold text-emerald-200">
                Tus archivos no salen de tu equipo
              </h2>
              <p className="mt-1 text-sm leading-6 text-stone-400">
                La conversión se realiza directamente en este navegador.
                No enviamos el archivo a nuestros servidores y no guardamos una copia.
              </p>

              <button
                type="button"
                onClick={() => setShowTechnical(!showTechnical)}
                aria-expanded={showTechnical}
                aria-controls="privacy-technical"
                className="mt-2 flex items-center gap-1 text-xs text-stone-500 hover:text-stone-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60"
              >
                {showTechnical ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
                Detalles técnicos
              </button>

              {showTechnical && (
                <p
                  id="privacy-technical"
                  className="mt-2 text-xs leading-5 text-stone-500"
                >
                  El archivo se lee con la API File del navegador y la descarga se genera con Blob URL.
                  No se realizan peticiones POST con el contenido del archivo a ningún endpoint.
                  Toda la transformación ocurre en memoria dentro del proceso del navegador.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <footer className="mt-12 flex flex-col items-center gap-2 border-t border-white/6 pt-6">
          <div className="flex items-center gap-2">
            <span className="h-px w-8 bg-gradient-to-r from-transparent to-white/15" />
            <p className="text-[10px] font-medium uppercase tracking-[0.26em] text-stone-600">
              Anclora FileStudio
            </p>
            <span className="h-1 w-1 rounded-full bg-teal-400/40" />
            <p className="text-[10px] font-medium uppercase tracking-[0.26em] text-stone-600">
              100% local
            </p>
            <span className="h-px w-8 bg-gradient-to-l from-transparent to-white/15" />
          </div>
          <p className="text-[9px] tracking-widest text-stone-700">{new Date().getFullYear()}</p>
        </footer>
      </div>
    </div>
  );
}
