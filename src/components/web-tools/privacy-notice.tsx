"use client";

import { ShieldCheck } from "lucide-react";

export function PrivacyNotice() {
  return (
    <section aria-labelledby="privacy-heading" className="rounded-lg border border-emerald-300/20 bg-emerald-400/6 p-4">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" aria-hidden="true" />
        <div>
          <h2 id="privacy-heading" className="text-sm font-semibold text-emerald-100">
            Tus archivos no salen del navegador
          </h2>
          <p className="mt-1 text-sm leading-6 text-stone-400">
            Las imágenes, PDF y datos se leen con la API File, se procesan en memoria y se descargan con Blob URL.
            No se envía contenido a `/api`, servidores externos ni almacenamiento cloud.
          </p>
        </div>
      </div>
    </section>
  );
}
