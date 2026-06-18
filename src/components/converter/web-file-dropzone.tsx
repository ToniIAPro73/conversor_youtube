"use client";

import { useCallback, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { Upload, X, FileText, AlertCircle } from "lucide-react";
import { normalizeFormat, BROWSER_CONVERSION_MAX_BYTES } from "@/lib/browser-conversion/validators";
import { getExtension } from "@/lib/browser-conversion/validators";

export type DropzoneState =
  | "idle"
  | "drag-active"
  | "drag-invalid"
  | "file-selected"
  | "file-too-large"
  | "error";

const ACCEPTED_EXTENSIONS = [".json", ".yaml", ".yml", ".toml", ".xml", ".csv", ".tsv"];
const ACCEPTED_FORMATS_DISPLAY = "JSON, YAML, TOML, XML, CSV y TSV";
const MAX_MB = Math.round(BROWSER_CONVERSION_MAX_BYTES / 1_000_000);

interface WebFileDropzoneProps {
  onFileSelected: (file: File) => void;
  onFileCleared: () => void;
  selectedFile: File | null;
  disabled?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function isValidFile(file: File): boolean {
  const ext = getExtension(file.name);
  return normalizeFormat(ext) !== null;
}

export function WebFileDropzone({
  onFileSelected,
  onFileCleared,
  selectedFile,
  disabled = false,
}: WebFileDropzoneProps) {
  const [dropState, setDropState] = useState<DropzoneState>("idle");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;

    const types = Array.from(e.dataTransfer.items).map((item) => item.type);
    const hasFile = e.dataTransfer.types.includes("Files");
    if (!hasFile) return;

    // Validate extension if name is available (not always during dragenter)
    const file = e.dataTransfer.files[0];
    if (file) {
      setDropState(isValidFile(file) ? "drag-active" : "drag-invalid");
    } else {
      setDropState("drag-active");
    }
    void types;
  }, [disabled]);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Only reset if leaving the zone entirely (not a child element)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDropState("idle");
    }
  }, []);

  const processFile = useCallback((file: File) => {
    if (!isValidFile(file)) {
      setDropState("error");
      return;
    }
    if (file.size > BROWSER_CONVERSION_MAX_BYTES) {
      setDropState("file-too-large");
      return;
    }
    setDropState("file-selected");
    onFileSelected(file);
  }, [onFileSelected]);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;

    const file = e.dataTransfer.files[0];
    if (!file) { setDropState("idle"); return; }
    processFile(file);
  }, [disabled, processFile]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
    // Reset input so the same file can be re-selected
    e.target.value = "";
  }, [processFile]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      inputRef.current?.click();
    }
  }, []);

  const handleClear = useCallback(() => {
    setDropState("idle");
    onFileCleared();
    if (inputRef.current) inputRef.current.value = "";
  }, [onFileCleared]);

  const openPicker = useCallback(() => {
    if (!disabled) inputRef.current?.click();
  }, [disabled]);

  // Derive display state
  const isSelected = selectedFile !== null && dropState === "file-selected";
  const isTooLarge = dropState === "file-too-large";
  const isInvalid = dropState === "drag-invalid" || dropState === "error";
  const isDragActive = dropState === "drag-active";

  return (
    <div className="w-full">
      <input
        ref={inputRef}
        type="file"
        id="web-file-dropzone-input"
        accept={ACCEPTED_EXTENSIONS.join(",")}
        onChange={handleInputChange}
        className="sr-only"
        aria-label="Seleccionar archivo para convertir"
        tabIndex={-1}
        disabled={disabled}
      />

      {isSelected && selectedFile ? (
        /* File selected state */
        <div
          className="flex items-start gap-3 rounded-xl border border-teal-300/25 bg-teal-400/6 p-4"
          role="status"
          aria-label={`Archivo seleccionado: ${selectedFile.name}`}
        >
          <FileText className="mt-0.5 h-5 w-5 shrink-0 text-teal-300" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-teal-100">{selectedFile.name}</p>
            <p className="mt-0.5 text-xs text-stone-400">
              {formatBytes(selectedFile.size)} · {getExtension(selectedFile.name).toUpperCase()}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={openPicker}
              className="rounded-md px-2 py-1 text-xs font-medium text-stone-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/70"
              aria-label="Reemplazar archivo"
            >
              Reemplazar
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="rounded-md p-1 text-stone-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/70"
              aria-label="Quitar archivo"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : (
        /* Drop zone idle / drag / error states */
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label="Arrastra un archivo aquí o pulsa Enter para abrir el selector de archivos"
          aria-disabled={disabled}
          onClick={openPicker}
          onKeyDown={handleKeyDown}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={[
            "flex min-h-[140px] w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/70 motion-reduce:transition-none",
            isDragActive
              ? "border-teal-300/60 bg-teal-400/8"
              : isInvalid || isTooLarge
                ? "border-red-400/50 bg-red-400/5"
                : "border-white/15 bg-white/3 hover:border-white/25 hover:bg-white/5",
            disabled ? "cursor-not-allowed opacity-50" : "",
          ].join(" ")}
        >
          {isTooLarge ? (
            <>
              <AlertCircle className="h-8 w-8 text-red-400" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-red-300">El archivo es demasiado grande</p>
                <p className="mt-1 text-xs text-stone-400">
                  La versión Web admite archivos de hasta {MAX_MB} MB.
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setDropState("idle"); }}
                className="mt-1 text-xs text-stone-400 underline underline-offset-2 hover:text-white"
              >
                Intentar con otro archivo
              </button>
            </>
          ) : isInvalid ? (
            <>
              <AlertCircle className="h-8 w-8 text-red-400" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-red-300">Archivo no compatible</p>
                <p className="mt-1 text-xs text-stone-400">
                  Usa {ACCEPTED_FORMATS_DISPLAY}.
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setDropState("idle"); }}
                className="mt-1 text-xs text-stone-400 underline underline-offset-2 hover:text-white"
              >
                Intentar con otro archivo
              </button>
            </>
          ) : isDragActive ? (
            <>
              <Upload className="h-8 w-8 text-teal-300" aria-hidden="true" />
              <p className="text-sm font-semibold text-teal-200">Suelta el archivo para continuar</p>
            </>
          ) : (
            <>
              <Upload className="h-8 w-8 text-stone-500" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-stone-300">
                  Arrastra el archivo aquí o{" "}
                  <span className="text-teal-300 underline underline-offset-2">selecciona uno</span>
                </p>
                <p className="mt-1.5 text-xs text-stone-500">
                  Formatos Web: {ACCEPTED_FORMATS_DISPLAY}
                </p>
                <p className="text-xs text-stone-600">
                  Tamaño máximo: {MAX_MB} MB
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
