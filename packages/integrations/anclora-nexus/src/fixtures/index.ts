// Request/response fixtures for contract testing

export const FIXTURES = {
  upload: {
    request: {
      filename: "documento.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      sizeBytes: 245760,
    },
    response: {
      id: "upl_01JXXXXXXXXXXXXXXXXX",
      clientId: "anclora-nexus",
      filename: "documento.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      sizeBytes: 245760,
      sha256: "a".repeat(64),
      status: "ready",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    },
  },

  jobCreate: {
    request: {
      operation: "document.docx-to-pdf",
      input: { uploadId: "upl_01JXXXXXXXXXXXXXXXXX" },
      options: { quality: "standard" },
      callback: { webhookEndpointId: "whe_01JXXXXXXXXXXXXXXXXX" },
      idempotencyKey: "nexus-doc-42-v1",
      metadata: {
        sourceApplication: "anclora-nexus",
        workspaceId: "ws_01JXXXXXXXXXXXXXXXXX",
        correlationId: "corr-abc-123",
      },
    },
    response: {
      jobId: "job_01JXXXXXXXXXXXXXXXXX",
      status: "created",
      operation: "document.docx-to-pdf",
      createdAt: new Date().toISOString(),
      links: {
        self: "/api/v1/jobs/job_01JXXXXXXXXXXXXXXXXX",
        events: "/api/v1/jobs/job_01JXXXXXXXXXXXXXXXXX/events",
      },
    },
  },

  jobStatus: {
    completed: {
      jobId: "job_01JXXXXXXXXXXXXXXXXX",
      status: "completed",
      operation: "document.docx-to-pdf",
      progress: 100,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    },
    failed: {
      jobId: "job_01JXXXXXXXXXXXXXXXXX",
      status: "failed",
      operation: "document.docx-to-pdf",
      progress: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    },
  },

  webhookEvent: {
    "job.completed": {
      type: "job.completed",
      jobId: "job_01JXXXXXXXXXXXXXXXXX",
      status: "completed",
      operation: "document.docx-to-pdf",
      workspaceId: "ws_01JXXXXXXXXXXXXXXXXX",
      correlationId: "corr-abc-123",
      completedAt: new Date().toISOString(),
      artifactSizeBytes: 189234,
      artifactSha256: "b".repeat(64),
    },
    "job.failed": {
      type: "job.failed",
      jobId: "job_01JXXXXXXXXXXXXXXXXX",
      status: "failed",
      operation: "document.docx-to-pdf",
      workspaceId: "ws_01JXXXXXXXXXXXXXXXXX",
      correlationId: "corr-abc-123",
      failedAt: new Date().toISOString(),
      errorCode: "ENGINE_EXECUTE_FAILED",
      errorMessage: "LibreOffice conversion failed",
      retryable: true,
    },
    "artifact.expiring": {
      type: "artifact.expiring",
      jobId: "job_01JXXXXXXXXXXXXXXXXX",
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      action: "download-now-or-lose",
    },
  },

  errorResponses: {
    notFound: { type: "about:blank", title: "Not Found", status: 404, code: "JOB_NOT_FOUND" },
    unauthorized: { type: "about:blank", title: "Unauthorized", status: 401, code: "AUTH_INVALID_TOKEN" },
    tooLarge: { type: "about:blank", title: "Payload Too Large", status: 413, code: "UPLOAD_TOO_LARGE" },
    quotaExceeded: { type: "about:blank", title: "Too Many Requests", status: 429, code: "QUOTA_EXCEEDED" },
    idempotencyConflict: { type: "about:blank", title: "Conflict", status: 409, code: "IDEMPOTENCY_CONFLICT" },
  },
} as const;
