import { describe, it, expect } from "vitest";
import { createAppError, isRetryable, ERROR_MESSAGES, type ErrorCode } from "../src/errors.js";

describe("isRetryable", () => {
  it("PROCESS_TIMEOUT is retryable", () => {
    expect(isRetryable("PROCESS_TIMEOUT")).toBe(true);
  });

  it("ENGINE_UNAVAILABLE is retryable", () => {
    expect(isRetryable("ENGINE_UNAVAILABLE")).toBe(true);
  });

  it("RATE_LIMITED is retryable", () => {
    expect(isRetryable("RATE_LIMITED")).toBe(true);
  });

  it("INPUT_CORRUPTED is not retryable", () => {
    expect(isRetryable("INPUT_CORRUPTED")).toBe(false);
  });

  it("UNSAFE_PATH is not retryable", () => {
    expect(isRetryable("UNSAFE_PATH")).toBe(false);
  });

  it("AUTH_INVALID_TOKEN is not retryable", () => {
    expect(isRetryable("AUTH_INVALID_TOKEN")).toBe(false);
  });
});

describe("createAppError", () => {
  it("creates error with correct code and name", () => {
    const err = createAppError("JOB_NOT_FOUND", "Job not found");
    expect(err.name).toBe("AppError");
    expect(err.code).toBe("JOB_NOT_FOUND");
    expect(err.message).toBe("Job not found");
  });

  it("sets retryable from code by default", () => {
    const retryable = createAppError("ENGINE_UNAVAILABLE", "");
    expect(retryable.retryable).toBe(true);

    const notRetryable = createAppError("INPUT_CORRUPTED", "");
    expect(notRetryable.retryable).toBe(false);
  });

  it("allows overriding retryable", () => {
    const err = createAppError("INPUT_CORRUPTED", "", { retryable: true });
    expect(err.retryable).toBe(true);
  });

  it("sets stage from options", () => {
    const err = createAppError("ENGINE_EXECUTE_FAILED", "", { stage: "ffmpeg" });
    expect(err.stage).toBe("ffmpeg");
  });

  it("defaults stage to unknown", () => {
    const err = createAppError("VALIDATION_FAILED", "");
    expect(err.stage).toBe("unknown");
  });

  it("sets engineId when provided", () => {
    const err = createAppError("TOOL_NOT_AVAILABLE", "", { engineId: "ffmpeg-media" });
    expect(err.engineId).toBe("ffmpeg-media");
  });

  it("sets cause when provided", () => {
    const cause = new Error("original");
    const err = createAppError("ENGINE_EXECUTE_FAILED", "", { cause });
    expect(err.cause).toBe(cause);
  });
});

describe("ERROR_MESSAGES", () => {
  const allCodes: ErrorCode[] = [
    "TOOL_NOT_AVAILABLE", "INPUT_UNSUPPORTED", "INPUT_CORRUPTED",
    "CAPABILITY_NOT_AVAILABLE", "OUTPUT_FORMAT_INVALID", "PROCESS_TIMEOUT",
    "PROCESS_CANCELLED", "ARTIFACT_VALIDATION_FAILED", "INSUFFICIENT_DISK_SPACE",
    "ARCHIVE_UNSAFE", "OCR_LANGUAGE_MISSING", "BATCH_PARTIAL_FAILURE",
    "JOB_NOT_FOUND", "ENGINE_NOT_FOUND", "ENGINE_UNAVAILABLE", "UNSAFE_PATH",
    "ENGINE_EXECUTE_FAILED", "VALIDATION_FAILED", "INPUT_NOT_FOUND",
    "MISSING_CONVERSION_ID", "INVALID_STATE", "RATE_LIMITED", "CONCURRENCY_LIMIT",
    "UPLOAD_NOT_FOUND", "UPLOAD_TOO_LARGE", "UPLOAD_EXPIRED", "UPLOAD_MIME_REJECTED",
    "AUTH_INVALID_TOKEN", "AUTH_EXPIRED_TOKEN", "AUTH_INSUFFICIENT_SCOPE",
    "AUTH_CLIENT_SUSPENDED", "IDEMPOTENCY_CONFLICT", "WEBHOOK_SSRF_BLOCKED",
    "OPERATION_UNAVAILABLE", "QUOTA_EXCEEDED", "TENANT_ISOLATION_VIOLATION",
  ];

  for (const code of allCodes) {
    it(`has message for ${code}`, () => {
      expect(ERROR_MESSAGES[code]).toBeTruthy();
      expect(typeof ERROR_MESSAGES[code]).toBe("string");
    });
  }
});
