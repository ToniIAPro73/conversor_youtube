"use client";

import { useMemo, useState } from "react";
import { Download, FileJson, Laptop, ShieldCheck } from "lucide-react";
import { convertStructuredData, type BrowserStructuredFormat } from "@/lib/browser-conversion";
import { getExtension, normalizeFormat } from "@/lib/browser-conversion/validators";

const TARGETS: Record<BrowserStructuredFormat, BrowserStructuredFormat[]> = {
  json: ["yaml", "toml", "xml", "csv", "tsv"],
  yaml: ["json", "toml", "xml"],
  toml: ["json", "yaml", "xml"],
  xml: ["json", "yaml"],
  csv: ["tsv", "json"],
  tsv: ["csv", "json"],
};

export function WebModeConverter() {
  const [file, setFile] = useState<File | null>(null);
  const [targetFormat, setTargetFormat] = useState<BrowserStructuredFormat>("json");
  const [message, setMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const sourceFormat = useMemo(() => file ? normalizeFormat(getExtension(file.name)) : null, [file]);
  const targets = sourceFormat ? TARGETS[sourceFormat] : [];

  const handleFileChange = (selected: File | null) => {
    setFile(selected);
    setMessage(null);
    setWarnings([]);
    const nextSource = selected ? normalizeFormat(getExtension(selected.name)) : null;
    if (nextSource) setTargetFormat(TARGETS[nextSource][0] ?? "json");
  };

  const handleConvert = async () => {
    if (!file || !sourceFormat) return;
    setMessage(null);
    setWarnings([]);

    try {
      const text = await file.text();
      const result = convertStructuredData({
        fileName: file.name,
        text,
        targetFormat,
      });
      const blob = new Blob([result.text], { type: result.mimeType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      setWarnings(result.warnings);
      setMessage("Conversión completada en tu navegador.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo convertir el archivo.");
    }
  };

  const windowsUrl = process.env.NEXT_PUBLIC_WINDOWS_DOWNLOAD_URL || "#";
  const linuxUrl = process.env.NEXT_PUBLIC_LINUX_DOWNLOAD_URL || "#";
  const supportUrl = process.env.NEXT_PUBLIC_SUPPORT_URL || "#";

  return (
    <main className="relative mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-6 text-stone-100 sm:px-6">
      <header className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="inline-flex rounded-md bg-teal-300 px-2 py-1 text-xs font-black text-[#071112]">
            Modo Web
          </span>
          <h1 className="mt-3 text-3xl font-black tracking-normal sm:text-5xl">Anclora FileStudio</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-300">
            Las conversiones compatibles se realizan en tu navegador. La versión Web no sube tus
            archivos ni ejecuta motores binarios en Vercel.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="inline-flex min-h-11 items-center gap-2 rounded-md bg-stone-100 px-3 text-sm font-bold text-[#101316]" href={windowsUrl}>
            <Download className="h-4 w-4" />
            Windows
          </a>
          <a className="inline-flex min-h-11 items-center gap-2 rounded-md border border-white/14 px-3 text-sm font-bold text-stone-100" href={linuxUrl}>
            <Download className="h-4 w-4" />
            Linux
          </a>
        </div>
      </header>

      <section className="grid gap-5 py-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-lg border border-white/10 bg-[#15191f] p-4">
          <div className="flex items-center gap-2">
            <FileJson className="h-5 w-5 text-teal-200" />
            <h2 className="text-lg font-bold">Conversión estructurada local</h2>
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="web-file-input" className="mb-1 block text-sm font-semibold text-stone-300">
                Archivo JSON, YAML, TOML, XML, CSV o TSV
              </label>
              <input
                id="web-file-input"
                type="file"
                accept=".json,.yaml,.yml,.toml,.xml,.csv,.tsv"
                onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
                className="block w-full rounded-md border border-white/14 bg-black/20 px-3 py-2 text-sm text-stone-100 file:mr-3 file:rounded-md file:border-0 file:bg-stone-100 file:px-3 file:py-2 file:text-sm file:font-bold file:text-[#101316]"
              />
            </div>

            <div>
              <label htmlFor="target-format" className="mb-1 block text-sm font-semibold text-stone-300">
                Formato de salida
              </label>
              <select
                id="target-format"
                value={targetFormat}
                disabled={!sourceFormat}
                onChange={(event) => setTargetFormat(event.target.value as BrowserStructuredFormat)}
                className="min-h-11 w-full rounded-md border border-white/14 bg-[#101316] px-3 text-sm text-stone-100 disabled:opacity-50"
              >
                {targets.length === 0 && <option value="json">Selecciona un archivo compatible</option>}
                {targets.map((target) => (
                  <option key={target} value={target}>{target.toUpperCase()}</option>
                ))}
              </select>
            </div>

            <button
              type="button"
              disabled={!file || !sourceFormat}
              onClick={handleConvert}
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-teal-300 px-4 text-sm font-black text-[#071112] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Convertir y descargar
            </button>

            {message && <p className="text-sm text-stone-300">{message}</p>}
            {warnings.map((warning) => (
              <p key={warning} className="text-sm text-amber-200">{warning}</p>
            ))}
          </div>
        </div>

        <aside className="space-y-3">
          <div className="rounded-lg border border-white/10 bg-[#15191f] p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-200" />
              <h2 className="text-lg font-bold">Privacidad Web</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-stone-300">
              El archivo se lee con APIs del navegador y la descarga se genera con Blob. No se envían
              bytes a `/api/*`.
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-[#15191f] p-4">
            <div className="flex items-center gap-2">
              <Laptop className="h-5 w-5 text-amber-200" />
              <h2 className="text-lg font-bold">Desktop requerido</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-stone-300">
              Audio, vídeo, Office, PDF avanzado, OCR, ebooks y archivos comprimidos requieren la
              aplicación Desktop o el futuro servicio VPS.
            </p>
            <a href={supportUrl} className="mt-3 inline-flex min-h-11 items-center text-sm font-bold text-teal-200">
              Ver soporte
            </a>
          </div>
        </aside>
      </section>
    </main>
  );
}
