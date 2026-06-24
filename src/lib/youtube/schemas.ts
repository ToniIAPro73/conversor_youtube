import { z } from "zod";
import { VideoQualitySelectionSchema } from "../quality/quality-contract";

export const MetadataRequestSchema = z.object({
  url: z.string().trim().url(),
});

export const VideoFormatSchema = z.object({
  formatId: z.string(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  fps: z.number().nullable(),
  ext: z.string(),
  vcodec: z.string().nullable(),
  acodec: z.string().nullable(),
  isVideoOnly: z.boolean(),
  fileSizeBytes: z.number().nullable(),
  fileSizeApproxBytes: z.number().nullable(),
  tbr: z.number().nullable(),
});

export const MetadataResponseSchema = z.object({
  videoId: z.string(),
  title: z.string(),
  channel: z.string(),
  thumbnailUrl: z.string().url(),
  durationSeconds: z.number(),
  durationLabel: z.string(),
  availableHeights: z.array(z.number()),
  supported: z.boolean(),
  videoFormats: z.array(VideoFormatSchema).default([]),
});

export const JobRequestSchema = z.object({
  videoId: z.string().length(11),
  format: z.enum(["mp3", "mp4"]),
  quality: z.union([z.string(), VideoQualitySelectionSchema]),
  rightsConfirmed: z.boolean().refine(val => val === true, {
    message: "Debes confirmar que tienes los derechos para descargar este contenido.",
  }),
});

export type MetadataRequest = z.infer<typeof MetadataRequestSchema>;
export type MetadataResponse = z.infer<typeof MetadataResponseSchema>;
export type JobRequest = z.infer<typeof JobRequestSchema>;
