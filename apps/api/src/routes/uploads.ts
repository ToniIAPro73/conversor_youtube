import { Hono } from "hono";
import { requireScope } from "../middleware/auth.js";
import type { AuthContext } from "../middleware/auth.js";

export function createUploadsRouter(): Hono {
  const app = new Hono();

  // POST /uploads — multipart file upload
  app.post("/", requireScope("filestudio:uploads:create"), async (c) => {
    const auth = c.get("auth") as AuthContext;
    const uploadService = c.get("uploadService") as UploadService | undefined;
    if (!uploadService) {
      return c.json({ type: "about:blank", title: "Service Unavailable", status: 503, code: "ENGINE_UNAVAILABLE" }, 503);
    }

    const contentType = c.req.header("Content-Type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return c.json({ type: "about:blank", title: "Bad Request", status: 400, code: "VALIDATION_FAILED", detail: "Content-Type must be multipart/form-data" }, 400);
    }

    const formData = await c.req.formData().catch(() => null);
    if (!formData) {
      return c.json({ type: "about:blank", title: "Bad Request", status: 400, code: "VALIDATION_FAILED", detail: "Invalid multipart body" }, 400);
    }

    const file = formData.get("file") as File | null;
    if (!file) {
      return c.json({ type: "about:blank", title: "Bad Request", status: 400, code: "VALIDATION_FAILED", detail: "Missing 'file' field in form data" }, 400);
    }

    try {
      const upload = await uploadService.create({
        clientId: auth.claims.client_id,
        workspaceId: auth.claims.sub,
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        stream: file.stream(),
        sizeBytes: file.size,
      });

      return c.json({
        id: upload.id,
        filename: upload.filename,
        mimeType: upload.mimeType,
        sizeBytes: upload.sizeBytes,
        sha256: upload.sha256,
        expiresAt: upload.expiresAt.toISOString(),
        status: "ready",
      }, 201);
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes("UPLOAD_TOO_LARGE")) {
          return c.json({ type: "about:blank", title: "Payload Too Large", status: 413, code: "UPLOAD_TOO_LARGE" }, 413);
        }
        if (err.message.includes("UPLOAD_MIME_REJECTED")) {
          return c.json({ type: "about:blank", title: "Unprocessable Entity", status: 422, code: "UPLOAD_MIME_REJECTED" }, 422);
        }
      }
      throw err;
    }
  });

  // GET /uploads/:id
  app.get("/:id", requireScope("filestudio:uploads:create"), async (c) => {
    const auth = c.get("auth") as AuthContext;
    const uploadService = c.get("uploadService") as UploadService | undefined;
    if (!uploadService) {
      return c.json({ type: "about:blank", title: "Service Unavailable", status: 503, code: "ENGINE_UNAVAILABLE" }, 503);
    }

    const upload = await uploadService.getByIdAndClient(c.req.param("id"), auth.claims.client_id);
    if (!upload) {
      return c.json({ type: "about:blank", title: "Not Found", status: 404, code: "UPLOAD_NOT_FOUND" }, 404);
    }

    return c.json({
      id: upload.id,
      filename: upload.filename,
      mimeType: upload.mimeType,
      sizeBytes: upload.sizeBytes,
      sha256: upload.sha256,
      status: upload.status,
      expiresAt: upload.expiresAt.toISOString(),
    });
  });

  // DELETE /uploads/:id
  app.delete("/:id", requireScope("filestudio:uploads:create"), async (c) => {
    const auth = c.get("auth") as AuthContext;
    const uploadService = c.get("uploadService") as UploadService | undefined;
    if (!uploadService) {
      return c.json({ type: "about:blank", title: "Service Unavailable", status: 503, code: "ENGINE_UNAVAILABLE" }, 503);
    }

    const ok = await uploadService.deleteByIdAndClient(c.req.param("id"), auth.claims.client_id);
    if (!ok) {
      return c.json({ type: "about:blank", title: "Not Found", status: 404, code: "UPLOAD_NOT_FOUND" }, 404);
    }

    return c.body(null, 204);
  });

  return app;
}

// ── Service interfaces (implemented in Subfase 5.3) ──────────────────────────

interface UploadRecord {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  status: string;
  expiresAt: Date;
}

interface UploadService {
  create(input: {
    clientId: string;
    workspaceId: string;
    filename: string;
    mimeType: string;
    stream: ReadableStream;
    sizeBytes: number;
  }): Promise<UploadRecord>;

  getByIdAndClient(id: string, clientId: string): Promise<UploadRecord | null>;
  deleteByIdAndClient(id: string, clientId: string): Promise<boolean>;
}
