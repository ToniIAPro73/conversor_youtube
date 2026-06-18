"use client";

import { useCallback, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { convertStructuredData, type BrowserStructuredFormat } from "@/lib/browser-conversion";
import { BROWSER_CONVERSION_MATRIX, BROWSER_MATRIX_DISPLAY, getTargetsForFormat } from "@/lib/browser-conversion/capabilities";
import { getExtension, normalizeFormat } from "@/lib/browser-conversion/validators";
import { downloadBlob } from "@/lib/browser-tools/common/download";
import { WebFileDropzone } from "@/components/converter/web-file-dropzone";

type ConvertState = "idle" | "converting" | "done" | "error";

export function StructuredDataTool() {
  const [file, setFile] = useState<File | null>(null);
  const [targetFormat, setTargetFormat] = useState<BrowserStructuredFormat>("json");
  const [state, setState] = useState<ConvertState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const sourceFormat = useMemo(() => file ? normalizeFormat(getExtension(file.name)) : null, [file]);
  const targets = useMemo(() => sourceFormat ? getTargetsForFormat(sourceFormat) : [], [sourceFormat]);

  const handleFileSelected = useCallback((selected: File) => {
    setFile(selected);
    setState("idle");
    setMessage(null);
    setWarnings([]);
    const nextSource = normalizeFormat(getExtension(selected.name));
    if (nextSource) {
      const nextTargets = BROWSER_CONVERSION_MATRIX[nextSource];
      if (nextTargets.length > 0) setTargetFormat(nextTargets[0]);
    }
  }, []);

  const handleConvert = useCallback(async () => {
    if (!file || !sourceFormat || state === "converting") return;
    setState("converting");
    setMessage(null);
    setWarnings([]);
    try {
      const result = convertStructuredData({ fileName: file.name, text: await file.text(), targetFormat });
      downloadBlob(new Blob([result.text], { type: result.mimeType }), result.fileName);
      setWarnings(result.warnings);
      setState("done");
      setMessage("Conversión completada en este navegador.");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "No se pudo convertir el archivo.");
    }
  }, [file, sourceFormat, targetFormat, state]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-black text-stone-100">Más herramientas</h2>
        <p className="mt-1 text-sm leading-6 text-stone-400">
          Conversiones estructuradas locales para JSON, YAML, TOML, XML, CSV y TSV.
        </p>
      </div>

      <WebFileDropzone
        selectedFile={file}
        onFileSelected={handleFileSelected}
        onFileCleared={() => { setFile(null); setState("idle"); setMessage(null); setWarnings([]); }}
        disabled={state === "converting"}
      />

      {file && sourceFormat && targets.length > 0 && (
        <div className="space-y-3">
          <label htmlFor="structured-target-format" className="block text-sm font-semibold text-stone-300">
            Formato de salida
          </label>
          <select
            id="structured-target-format"
            value={targetFormat}
            onChange={(event) => setTargetFormat(event.target.value as BrowserStructuredFormat)}
            className="min-h-11 w-full rounded-md border border-white/14 bg-[#0d1015] px-3 text-sm text-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60"
          >
            {targets.map((target) => <option key={target} value={target}>{target.toUpperCase()}</option>)}
          </select>
          <button
            type="button"
            onClick={() => void handleConvert()}
            disabled={state === "converting"}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-teal-300 px-4 text-sm font-black text-[#071112] disabled:opacity-50"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {state === "converting" ? "Convirtiendo" : `Convertir a ${targetFormat.toUpperCase()}`}
          </button>
        </div>
      )}

      {message && (
        <p role="status" aria-live="polite" className={`rounded-md border p-3 text-sm ${state === "error" ? "border-red-400/30 bg-red-400/8 text-red-200" : "border-emerald-400/25 bg-emerald-400/6 text-emerald-200"}`}>
          {message}
        </p>
      )}

      {warnings.length > 0 && (
        <ul className="space-y-1 text-xs text-amber-300" aria-label="Avisos de conversión">
          {warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      )}

      <div className="overflow-x-auto rounded-lg border border-white/8 bg-white/3">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/8">
              <th className="px-4 py-2 text-left font-semibold text-stone-400">Entrada</th>
              <th className="px-4 py-2 text-left font-semibold text-stone-400">Salidas</th>
            </tr>
          </thead>
          <tbody>
            {BROWSER_MATRIX_DISPLAY.map(({ input, outputs }) => (
              <tr key={input} className="border-b border-white/5 last:border-0">
                <td className="px-4 py-2 font-medium text-teal-200">{input}</td>
                <td className="px-4 py-2 text-stone-300">{outputs.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
