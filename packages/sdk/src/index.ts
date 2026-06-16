// @anclora/filestudio-sdk
// TypeScript SDK for Anclora FileStudio Service.
// Intended consumers: Anclora Nexus and other authorized internal applications.

export {
  AncloraFileStudioClient,
  FileStudioError,
  FileStudioAuthError,
  FileStudioNotFoundError,
  FileStudioRateLimitError,
} from "./client.js";

export type {
  ClientOptions,
  UploadRecord,
  JobRecord,
  CreateJobOptions,
} from "./client.js";
