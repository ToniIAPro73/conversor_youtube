export type ImageOutputFormat = "jpeg" | "png" | "webp";

export type ImageAction = "convert" | "compress" | "resize";

export interface ImageToolOptions {
  action: ImageAction;
  outputFormat: ImageOutputFormat;
  quality: number;
  stripMetadata: boolean;
  resizeMode: "none" | "width" | "height" | "max-side" | "percent";
  width?: number;
  height?: number;
  maxSide?: number;
  percent?: number;
  preventUpscale: boolean;
  jpegBackground: string;
}

export interface ImageMetadataSummary {
  hasExif: boolean;
  hasGps: boolean;
  camera?: string;
  software?: string;
  takenAt?: string;
  orientation?: number;
}

export interface ImageProcessResult {
  fileName: string;
  blob: Blob;
  originalBytes: number;
  finalBytes: number;
  originalWidth: number;
  originalHeight: number;
  finalWidth: number;
  finalHeight: number;
  metadata: ImageMetadataSummary;
  metadataStripped: boolean;
  stripVerified: boolean;
  warnings: string[];
}
