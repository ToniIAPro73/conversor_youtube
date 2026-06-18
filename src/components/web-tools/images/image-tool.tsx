"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Download, ImageIcon, Trash2 } from "lucide-react";
import { createZipBlob } from "@/lib/browser-tools/common/zip";
import { downloadBlob } from "@/lib/browser-tools/common/download";
import { formatBytes } from "@/lib/browser-tools/common/filenames";
import { WEB_TOOL_LIMITS } from "@/lib/browser-tools/common/limits";
import { processImage, readImageMetadata } from "@/lib/browser-tools/images/process";
import type { ImageOutputFormat, ImageProcessResult, ImageToolOptions } from "@/lib/browser-tools/images/types";

const ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";

export function ImageTool() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<ImageProcessResult[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [metadataSummary, setMetadataSummary] = useState<string | null>(null);
  const [options, setOptions] = useState<ImageToolOptions>({
    action: "convert",
    outputFormat: "webp",
    quality: 82,
    stripMetadata: true,
    resizeMode: "none",
    width: 1280,
    height: 720,
    maxSide: 1920,
    percent: 50,
    preventUpscale: true,
    jpegBackground: "#ffffff",
  });

  const totalBytes = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);

  const addFiles = useCallback((nextFiles: FileList | File[]) => {
    const incoming = Array.from(nextFiles).slice(0, WEB_TOOL_LIMITS.image.maxFiles);
    const accepted = incoming.filter((file) => ACCEPT.split(",").some((part) => {
      const clean = part.trim();
      return clean.startsWith(".") ? file.name.toLowerCase().endsWith(clean) : file.type === clean;
    }));
    setFiles(accepted);
    setResults([]);
    setMessage(accepted.length === incoming.length ? null : "Algunos archivos no tienen formato compatible.");
  }, []);

  const inspectMetadata = useCallback(async () => {
    if (!files[0]) return;
    const metadata = await readImageMetadata(files[0]);
    setMetadataSummary([
      metadata.hasExif ? "EXIF detectado" : "Sin EXIF detectable",
      metadata.hasGps ? "GPS detectado (oculto por privacidad)" : "Sin GPS detectable",
      metadata.camera ? `Cámara: ${metadata.camera}` : null,
      metadata.software ? `Software: ${metadata.software}` : null,
      metadata.orientation ? `Orientación: ${metadata.orientation}` : null,
    ].filter(Boolean).join(" · "));
  }, [files]);

  const runBatch = useCallback(async () => {
    if (files.length === 0 || busy) return;
    if (totalBytes > WEB_TOOL_LIMITS.image.maxTotalBytes) {
      setMessage("El lote supera el tamaño máximo permitido en la versión Web.");
      return;
    }
    setBusy(true);
    setMessage(`Procesando 0 de ${files.length}`);
    const nextResults: ImageProcessResult[] = [];
    try {
      for (let index = 0; index < files.length; index += 1) {
        setMessage(`Procesando ${index + 1} de ${files.length}`);
        nextResults.push(await processImage(files[index], options));
        setResults([...nextResults]);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      setMessage("Conversión completada.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No hemos podido leer la imagen.");
    } finally {
      setBusy(false);
    }
  }, [files, options, busy, totalBytes]);

  const downloadAll = useCallback(async () => {
    if (results.length === 0) return;
    if (results.length === 1) {
      downloadBlob(results[0].blob, results[0].fileName);
      return;
    }
    const entries = await Promise.all(results.map(async (result) => ({
      name: result.fileName,
      bytes: new Uint8Array(await result.blob.arrayBuffer()),
    })));
    entries.push({
      name: "manifest.json",
      bytes: new TextEncoder().encode(JSON.stringify({
        results: results.map((result) => ({
          fileName: result.fileName,
          originalBytes: result.originalBytes,
          finalBytes: result.finalBytes,
          originalDimensions: [result.originalWidth, result.originalHeight],
          finalDimensions: [result.finalWidth, result.finalHeight],
          metadataStripped: result.metadataStripped,
          stripVerified: result.stripVerified,
          warnings: result.warnings,
        })),
      }, null, 2)),
    });
    downloadBlob(await createZipBlob(entries), "imagenes-anclora.zip");
  }, [results]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-black text-stone-100">Preparar imágenes</h2>
        <p className="mt-1 text-sm leading-6 text-stone-400">
          Convierte, comprime, cambia el tamaño y elimina metadatos privados en JPEG, PNG y WebP.
        </p>
      </div>

      <input ref={inputRef} type="file" multiple accept={ACCEPT} className="sr-only" onChange={(event) => event.target.files && addFiles(event.target.files)} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files); }}
        className="flex min-h-[132px] w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-white/15 bg-white/3 p-6 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60"
      >
        <ImageIcon className="h-8 w-8 text-teal-300" aria-hidden="true" />
        <span className="text-sm font-semibold text-stone-200">Arrastra imágenes o selecciona archivos</span>
        <span className="text-xs text-stone-500">JPG, PNG, WebP · hasta {WEB_TOOL_LIMITS.image.maxFiles} archivos</span>
      </button>

      {files.length > 0 && (
        <div className="rounded-lg border border-white/8 bg-white/3 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-stone-200">{files.length} imagen(es) · {formatBytes(totalBytes)}</p>
            <button type="button" onClick={() => { setFiles([]); setResults([]); }} className="inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm text-stone-300 hover:bg-white/6">
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Quitar
            </button>
          </div>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {files.map((file) => <li key={`${file.name}-${file.size}`} className="truncate rounded-md bg-black/20 px-3 py-2 text-xs text-stone-400">{file.name}</li>)}
          </ul>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm font-semibold text-stone-300">
          Acción
          <select value={options.action} onChange={(event) => setOptions({ ...options, action: event.target.value as ImageToolOptions["action"] })} className="min-h-11 w-full rounded-md border border-white/14 bg-[#0d1015] px-3 text-stone-100">
            <option value="convert">Convertir</option>
            <option value="compress">Comprimir</option>
            <option value="resize">Redimensionar</option>
          </select>
        </label>
        <label className="space-y-1 text-sm font-semibold text-stone-300">
          Formato de salida
          <select value={options.outputFormat} onChange={(event) => setOptions({ ...options, outputFormat: event.target.value as ImageOutputFormat })} className="min-h-11 w-full rounded-md border border-white/14 bg-[#0d1015] px-3 text-stone-100">
            <option value="webp">WebP</option>
            <option value="jpeg">JPEG</option>
            <option value="png">PNG</option>
          </select>
        </label>
        <label className="space-y-1 text-sm font-semibold text-stone-300">
          Calidad {options.quality}
          <input type="range" min="1" max="100" value={options.quality} onChange={(event) => setOptions({ ...options, quality: Number(event.target.value) })} className="w-full accent-teal-300" />
        </label>
        <label className="space-y-1 text-sm font-semibold text-stone-300">
          Redimensionado
          <select value={options.resizeMode} onChange={(event) => setOptions({ ...options, resizeMode: event.target.value as ImageToolOptions["resizeMode"] })} className="min-h-11 w-full rounded-md border border-white/14 bg-[#0d1015] px-3 text-stone-100">
            <option value="none">Sin redimensionar</option>
            <option value="width">Solo ancho</option>
            <option value="height">Solo alto</option>
            <option value="max-side">Lado máximo</option>
            <option value="percent">Porcentaje</option>
          </select>
        </label>
        {options.resizeMode !== "none" && (
          <label className="space-y-1 text-sm font-semibold text-stone-300">
            Valor
            <input type="number" min="1" value={options.resizeMode === "width" ? options.width : options.resizeMode === "height" ? options.height : options.resizeMode === "percent" ? options.percent : options.maxSide} onChange={(event) => {
              const value = Number(event.target.value);
              setOptions({
                ...options,
                width: options.resizeMode === "width" ? value : options.width,
                height: options.resizeMode === "height" ? value : options.height,
                percent: options.resizeMode === "percent" ? value : options.percent,
                maxSide: options.resizeMode === "max-side" ? value : options.maxSide,
              });
            }} className="min-h-11 w-full rounded-md border border-white/14 bg-[#0d1015] px-3 text-stone-100" />
          </label>
        )}
        <label className="space-y-1 text-sm font-semibold text-stone-300">
          Fondo JPEG
          <input type="color" value={options.jpegBackground} onChange={(event) => setOptions({ ...options, jpegBackground: event.target.value })} className="h-11 w-full rounded-md border border-white/14 bg-[#0d1015] p-1" />
        </label>
      </div>

      <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-stone-300">
        <input type="checkbox" checked={options.stripMetadata} onChange={(event) => setOptions({ ...options, stripMetadata: event.target.checked })} className="h-4 w-4 accent-teal-300" />
        Eliminar EXIF y ubicación
      </label>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void inspectMetadata()} disabled={!files[0]} className="min-h-11 rounded-md border border-white/12 px-4 text-sm font-semibold text-stone-200 disabled:opacity-50">
          Leer metadatos
        </button>
        <button type="button" onClick={() => void runBatch()} disabled={busy || files.length === 0} className="min-h-11 rounded-md bg-teal-300 px-4 text-sm font-black text-[#071112] disabled:opacity-50">
          {busy ? "Procesando" : "Procesar"}
        </button>
        <button type="button" onClick={() => void downloadAll()} disabled={results.length === 0} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-white/12 px-4 text-sm font-semibold text-stone-200 disabled:opacity-50">
          <Download className="h-4 w-4" aria-hidden="true" /> Descargar resultado
        </button>
      </div>

      {metadataSummary && <p className="rounded-md border border-white/8 bg-white/3 p-3 text-sm text-stone-300">{metadataSummary}</p>}
      {message && <p role="status" aria-live="polite" className="rounded-md border border-white/8 bg-white/3 p-3 text-sm text-stone-300">{message}</p>}

      {results.length > 0 && (
        <ul className="space-y-2" aria-label="Resultados de imágenes">
          {results.map((result) => (
            <li key={result.fileName} className="rounded-md border border-white/8 bg-white/3 p-3 text-sm text-stone-300">
              <strong className="text-stone-100">{result.fileName}</strong>
              <span className="ml-2 text-stone-500">{result.finalWidth}x{result.finalHeight} · {formatBytes(result.originalBytes)} {"->"} {formatBytes(result.finalBytes)}</span>
              {result.metadataStripped && <span className="ml-2 text-emerald-300">{result.stripVerified ? "Metadatos eliminados" : "Verificación parcial"}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
