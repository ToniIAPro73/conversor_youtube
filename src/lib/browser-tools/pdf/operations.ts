import { withExtension } from "../common/filenames";
import { parsePageRanges } from "./ranges";

export type PdfRotation = 0 | 90 | 180 | 270;

export async function getPdfPageCount(file: File): Promise<number> {
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: false });
  return pdf.getPageCount();
}

export async function mergePdfs(files: File[]): Promise<Blob> {
  const { PDFDocument } = await import("pdf-lib");
  const merged = await PDFDocument.create();
  for (const file of files) {
    const source = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: false });
    const copied = await merged.copyPages(source, source.getPageIndices());
    copied.forEach((page) => merged.addPage(page));
  }
  return pdfBytesToBlob(await merged.save());
}

export async function splitPdfByRange(file: File, ranges: string): Promise<Array<{ name: string; blob: Blob }>> {
  const { PDFDocument } = await import("pdf-lib");
  const source = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: false });
  const pageNumbers = parsePageRanges(ranges, source.getPageCount());
  const result = await PDFDocument.create();
  const copied = await result.copyPages(source, pageNumbers.map((page) => page - 1));
  copied.forEach((page) => result.addPage(page));
  return [{
    name: withExtension(`${file.name.replace(/\.pdf$/i, "")}-${ranges.replace(/[^0-9,-]/g, "")}`, "pdf"),
    blob: pdfBytesToBlob(await result.save()),
  }];
}

export async function reorderPdf(file: File, order: number[], outputName?: string): Promise<Blob> {
  const { PDFDocument } = await import("pdf-lib");
  const source = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: false });
  if (order.length !== source.getPageCount()) throw new Error("El orden no coincide con el número de páginas.");
  const result = await PDFDocument.create();
  const copied = await result.copyPages(source, order.map((page) => page - 1));
  copied.forEach((page) => result.addPage(page));
  void outputName;
  return pdfBytesToBlob(await result.save());
}

export async function rotatePdf(file: File, rotation: PdfRotation, allPages = true): Promise<Blob> {
  const { PDFDocument, degrees } = await import("pdf-lib");
  const source = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: false });
  const pages = allPages ? source.getPages() : [source.getPage(0)];
  for (const page of pages) {
    const current = page.getRotation().angle;
    page.setRotation(degrees((current + rotation) % 360));
  }
  return pdfBytesToBlob(await source.save());
}

export async function imagesToPdf(files: File[], outputName = "imagenes.pdf"): Promise<Blob> {
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  for (const file of files) {
    const bytes = await file.arrayBuffer();
    const image = file.type === "image/png" || file.name.toLowerCase().endsWith(".png")
      ? await pdf.embedPng(bytes)
      : await pdf.embedJpg(await imageBytesForPdf(file));
    const page = pdf.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  }
  void outputName;
  return pdfBytesToBlob(await pdf.save());
}

function pdfBytesToBlob(bytes: Uint8Array): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type: "application/pdf" });
}

async function imageBytesForPdf(file: File): Promise<ArrayBuffer> {
  if (file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name)) return file.arrayBuffer();
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo preparar la imagen para PDF.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error("No se pudo convertir la imagen a JPEG.")), "image/jpeg", 0.92);
    });
    return blob.arrayBuffer();
  } finally {
    bitmap.close();
  }
}
