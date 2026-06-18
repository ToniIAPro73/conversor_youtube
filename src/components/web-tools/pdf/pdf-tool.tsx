"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Download, FileText, RotateCw } from "lucide-react";
import { downloadBlob } from "@/lib/browser-tools/common/download";
import { formatBytes } from "@/lib/browser-tools/common/filenames";
import { WEB_TOOL_LIMITS } from "@/lib/browser-tools/common/limits";
import { createZipBlob } from "@/lib/browser-tools/common/zip";
import { getPdfPageCount, imagesToPdf, mergePdfs, reorderPdf, rotatePdf, splitPdfByRange, type PdfRotation } from "@/lib/browser-tools/pdf/operations";

type PdfOperation = "merge" | "split" | "reorder" | "rotate" | "images-to-pdf";

interface PdfItem {
  file: File;
  pageCount?: number;
  error?: string;
}

const PDF_ACCEPT = "application/pdf,.pdf";
const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";

export function PdfTool() {
  const inputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [operation, setOperation] = useState<PdfOperation>("merge");
  const [items, setItems] = useState<PdfItem[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [pageOrder, setPageOrder] = useState<number[]>([]);
  const [range, setRange] = useState("1");
  const [rotation, setRotation] = useState<PdfRotation>(90);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const totalBytes = useMemo(() => [...items.map((item) => item.file), ...imageFiles].reduce((sum, file) => sum + file.size, 0), [items, imageFiles]);
  const primaryPdf = items[0];

  useEffect(() => {
    let cancelled = false;
    async function inspect() {
      const inspected: PdfItem[] = [];
      for (const item of items) {
        try {
          inspected.push({ ...item, pageCount: await getPdfPageCount(item.file) });
        } catch {
          inspected.push({ ...item, error: "Este PDF está protegido o no puede leerse en la versión Web." });
        }
      }
      if (!cancelled) {
        setItems((current) => current.length === inspected.length ? inspected : current);
        const count = inspected[0]?.pageCount;
        if (count) setPageOrder(Array.from({ length: count }, (_, index) => index + 1));
      }
    }
    if (items.some((item) => item.pageCount === undefined && item.error === undefined)) void inspect();
    return () => { cancelled = true; };
  }, [items]);

  const addPdfs = useCallback((files: FileList | File[]) => {
    const selected = Array.from(files)
      .filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))
      .slice(0, WEB_TOOL_LIMITS.pdf.maxFiles);
    setItems(selected.map((file) => ({ file })));
    setMessage(selected.length === 0 ? "Selecciona uno o varios PDF válidos." : null);
  }, []);

  const addImages = useCallback((files: FileList | File[]) => {
    setImageFiles(Array.from(files).filter((file) => file.type.startsWith("image/")).slice(0, WEB_TOOL_LIMITS.image.maxFiles));
    setMessage(null);
  }, []);

  const movePdf = useCallback((index: number, delta: number) => {
    setItems((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const movePage = useCallback((index: number, delta: number) => {
    setPageOrder((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const run = useCallback(async () => {
    if (busy) return;
    if (totalBytes > WEB_TOOL_LIMITS.pdf.maxTotalBytes) {
      setMessage("Los archivos superan el límite de tamaño para la versión Web.");
      return;
    }
    setBusy(true);
    setMessage("Generando PDF localmente.");
    try {
      if (operation === "images-to-pdf") {
        if (imageFiles.length === 0) throw new Error("Añade imágenes para crear el PDF.");
        const blob = await imagesToPdf(imageFiles);
        downloadBlob(blob, "imagenes.pdf");
      } else if (operation === "merge") {
        if (items.length < 2) throw new Error("Añade al menos dos PDF para unir.");
        downloadBlob(await mergePdfs(items.map((item) => item.file)), "documentos-unidos.pdf");
      } else if (operation === "split") {
        if (!primaryPdf) throw new Error("Añade un PDF para dividir.");
        const outputs = await splitPdfByRange(primaryPdf.file, range);
        if (outputs.length === 1) downloadBlob(outputs[0].blob, outputs[0].name);
        else {
          const entries = await Promise.all(outputs.map(async (output) => ({ name: output.name, bytes: new Uint8Array(await output.blob.arrayBuffer()) })));
          downloadBlob(await createZipBlob(entries), "pdf-dividido.zip");
        }
      } else if (operation === "reorder") {
        if (!primaryPdf) throw new Error("Añade un PDF para reordenar.");
        downloadBlob(await reorderPdf(primaryPdf.file, pageOrder), "pdf-reordenado.pdf");
      } else if (operation === "rotate") {
        if (!primaryPdf) throw new Error("Añade un PDF para rotar.");
        downloadBlob(await rotatePdf(primaryPdf.file, rotation, true), "pdf-rotado.pdf");
      }
      setMessage("PDF generado y descargado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo procesar el PDF.");
    } finally {
      setBusy(false);
    }
  }, [busy, totalBytes, operation, imageFiles, items, primaryPdf, range, pageOrder, rotation]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-black text-stone-100">Organizar PDF</h2>
        <p className="mt-1 text-sm leading-6 text-stone-400">
          Une, divide, ordena y gira páginas, o crea un PDF a partir de imágenes. Todo se procesa localmente.
        </p>
      </div>

      <label className="space-y-1 text-sm font-semibold text-stone-300">
        Operación
        <select value={operation} onChange={(event) => { setOperation(event.target.value as PdfOperation); setMessage(null); }} className="min-h-11 w-full rounded-md border border-white/14 bg-[#0d1015] px-3 text-stone-100">
          <option value="merge">Unir PDF</option>
          <option value="split">Dividir PDF</option>
          <option value="reorder">Reordenar páginas</option>
          <option value="rotate">Rotar páginas</option>
          <option value="images-to-pdf">Crear PDF desde imágenes</option>
        </select>
      </label>

      <input ref={inputRef} type="file" multiple accept={PDF_ACCEPT} className="sr-only" onChange={(event) => event.target.files && addPdfs(event.target.files)} />
      <input ref={imageInputRef} type="file" multiple accept={IMAGE_ACCEPT} className="sr-only" onChange={(event) => event.target.files && addImages(event.target.files)} />

      {operation === "images-to-pdf" ? (
        <button type="button" onClick={() => imageInputRef.current?.click()} className="flex min-h-[120px] w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-white/15 bg-white/3 p-6 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60">
          <FileText className="h-8 w-8 text-teal-300" aria-hidden="true" />
          <span className="text-sm font-semibold text-stone-200">Selecciona imágenes para crear un PDF</span>
          <span className="text-xs text-stone-500">JPEG, PNG y WebP</span>
        </button>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} className="flex min-h-[120px] w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-white/15 bg-white/3 p-6 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60">
          <FileText className="h-8 w-8 text-teal-300" aria-hidden="true" />
          <span className="text-sm font-semibold text-stone-200">Selecciona PDF</span>
          <span className="text-xs text-stone-500">Hasta {WEB_TOOL_LIMITS.pdf.maxFiles} archivos · {formatBytes(totalBytes)}</span>
        </button>
      )}

      {operation === "images-to-pdf" && imageFiles.length > 0 && (
        <ul className="space-y-2">
          {imageFiles.map((file) => <li key={`${file.name}-${file.size}`} className="rounded-md border border-white/8 bg-white/3 px-3 py-2 text-sm text-stone-300">{file.name}</li>)}
        </ul>
      )}

      {operation !== "images-to-pdf" && items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li key={`${item.file.name}-${item.file.size}`} className="flex items-center gap-2 rounded-md border border-white/8 bg-white/3 p-3 text-sm text-stone-300">
              <span className="min-w-0 flex-1 truncate">{item.file.name} · {item.pageCount ? `${item.pageCount} páginas` : item.error ?? "Leyendo"}</span>
              {operation === "merge" && (
                <>
                  <button type="button" onClick={() => movePdf(index, -1)} className="min-h-10 rounded-md px-2 hover:bg-white/6" aria-label="Mover PDF arriba"><ArrowUp className="h-4 w-4" /></button>
                  <button type="button" onClick={() => movePdf(index, 1)} className="min-h-10 rounded-md px-2 hover:bg-white/6" aria-label="Mover PDF abajo"><ArrowDown className="h-4 w-4" /></button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {operation === "split" && (
        <label className="space-y-1 text-sm font-semibold text-stone-300">
          Rango de páginas
          <input value={range} onChange={(event) => setRange(event.target.value)} placeholder="1-3,7,10-12" className="min-h-11 w-full rounded-md border border-white/14 bg-[#0d1015] px-3 text-stone-100" />
        </label>
      )}

      {operation === "reorder" && pageOrder.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5" aria-label="Orden de páginas">
          {pageOrder.map((page, index) => (
            <div key={`${page}-${index}`} className="rounded-md border border-white/8 bg-white/3 p-3 text-center">
              <p className="text-sm font-bold text-stone-100">Página {page}</p>
              <div className="mt-2 flex justify-center gap-1">
                <button type="button" onClick={() => movePage(index, -1)} className="min-h-10 rounded-md px-2 hover:bg-white/6" aria-label={`Mover página ${page} a la izquierda`}><ArrowUp className="h-4 w-4 -rotate-90" /></button>
                <button type="button" onClick={() => movePage(index, 1)} className="min-h-10 rounded-md px-2 hover:bg-white/6" aria-label={`Mover página ${page} a la derecha`}><ArrowDown className="h-4 w-4 -rotate-90" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {operation === "rotate" && (
        <label className="space-y-1 text-sm font-semibold text-stone-300">
          Rotación
          <select value={rotation} onChange={(event) => setRotation(Number(event.target.value) as PdfRotation)} className="min-h-11 w-full rounded-md border border-white/14 bg-[#0d1015] px-3 text-stone-100">
            <option value={90}>90° derecha</option>
            <option value={270}>90° izquierda</option>
            <option value={180}>180°</option>
          </select>
        </label>
      )}

      <button type="button" onClick={() => void run()} disabled={busy} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-teal-300 px-4 text-sm font-black text-[#071112] disabled:opacity-50">
        {operation === "rotate" ? <RotateCw className="h-4 w-4" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
        {busy ? "Procesando" : "Generar y descargar"}
      </button>

      <p className="text-xs leading-5 text-amber-200">
        Modificar un PDF firmado puede invalidar firmas. Los PDF protegidos no se procesan en la versión Web.
      </p>
      {message && <p role="status" aria-live="polite" className="rounded-md border border-white/8 bg-white/3 p-3 text-sm text-stone-300">{message}</p>}
    </div>
  );
}
