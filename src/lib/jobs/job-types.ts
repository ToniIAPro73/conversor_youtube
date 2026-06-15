// Re-export from SQLite repository for backwards compatibility
export type { JobStatus, JobRow as Job } from "../infrastructure/db/job-repository";

export type ConversionOperation =
  | "transcode-audio"
  | "transcode-video"
  | "extract-audio"
  | "remux"
  | "trim"
  | "normalize-audio"
  | "create-gif"
  | "extract-thumbnail"
  | "extract-frames"
  | "extract-subtitles";

export type AudioOutputFormat = "mp3" | "m4a" | "wav" | "flac" | "ogg";
export type VideoOutputFormat = "mp4" | "webm" | "mkv";
export type OutputFormat = AudioOutputFormat | VideoOutputFormat;
