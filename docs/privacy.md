# Privacy

Anclora FileStudio is local-first. Desktop and Local Agent do not require Docker and do not open inbound ports.

## Web Version

The Web version processes Phase 1 image, PDF and structured data workflows in
the browser:

```text
File -> browser memory -> Blob -> local download
```

The Web version does not upload file content to `/api/*`, Vercel Blob, S3,
Supabase, Cloudinary, external conversion APIs or a VPS worker. `/api/health`
and `/api/capabilities` expose metadata only.

The Service mode is private infrastructure, not local execution. Logs must not contain file content, full temporary URLs, Authorization headers, tokens, private keys, private local paths or full sensitive names.

Local Agent default consent policy is `ask-always`; non-TTY mode rejects jobs instead of silently accepting them.
