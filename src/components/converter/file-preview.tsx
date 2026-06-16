"use client";

import { useMemo } from "react";
import { Eye, AlertTriangle } from "lucide-react";

const MAX_PREVIEW_BYTES = 50 * 1024; // 50 KB

interface FilePreviewProps {
  /** Raw content as string (text formats) or null for binary formats */
  content: string | null;
  /** File extension (lowercase, no dot) */
  extension: string;
  /** MIME type for detection */
  mimeType?: string;
  /** Object URL for image preview */
  objectUrl?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Strip <script>, <iframe>, <object>, and on* attributes from HTML */
function sanitizeHtml(html: string): string {
  return html
    // Remove script tags and content
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    // Remove iframe tags
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    // Remove object tags
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    // Remove on* attributes
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, "")
    // Remove javascript: URLs
    .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"');
}

/** Simple regex-based Markdown renderer — no heavy deps */
function renderMarkdown(md: string): string {
  return md
    // Headings: ## Title → <strong>## Title</strong>
    .replace(/^(#{1,6})\s+(.+)$/gm, "<strong>$1 $2</strong>")
    // Bold: **text** → <strong>text</strong>
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Italic: *text* → <em>text</em>
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>")
    // Links: [text](url) → text (url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    // Images: ![alt](url) → [Image: alt]
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "[Image: $1]")
    // Code: `code` → <code>code</code>
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // Strip remaining HTML tags
    .replace(/<\/?(?!strong|em|code)[^>]+>/g, "");
}

/** Detect preview type from extension/mime */
type PreviewKind = "image" | "html" | "markdown" | "code" | "data" | "text" | "binary";

function detectPreviewKind(extension: string, mimeType?: string): PreviewKind {
  const ext = extension.toLowerCase();

  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "tiff", "tif", "ico", "avif"].includes(ext)) {
    return "image";
  }
  if (ext === "html" || ext === "htm") {
    return "html";
  }
  if (ext === "md" || ext === "markdown") {
    return "markdown";
  }
  if (["json", "yaml", "yml", "toml", "xml", "csv", "tsv"].includes(ext)) {
    return "data";
  }
  if (["js", "ts", "jsx", "tsx", "py", "rb", "go", "rs", "java", "c", "cpp", "h", "css", "scss", "less", "sh", "bash", "zsh", "sql", "r", "lua", "vim"].includes(ext)) {
    return "code";
  }
  if (["rst", "tex", "latex", "log", "ini", "cfg", "conf", "env"].includes(ext)) {
    return "text";
  }
  if (mimeType?.startsWith("text/")) {
    return "text";
  }
  return "binary";
}

/** Simple syntax highlighting for data formats */
function highlightData(text: string, kind: "data" | "code" | "text"): string {
  if (kind === "data") {
    return text
      // JSON/YAML keys
      .replace(/([{,]\s*)"([^"]+)"(\s*:)/g, '$1<span class="text-cyan-400">"$2"</span>$3')
      // String values
      .replace(/:\s*"([^"]*)"/g, ': <span class="text-emerald-400">"$1"</span>')
      // Numbers
      .replace(/:\s*(\d+\.?\d*)/g, ': <span class="text-amber-400">$1</span>')
      // Booleans/null
      .replace(/:\s*(true|false|null)/g, ': <span class="text-purple-400">$1</span>')
      // XML tags
      .replace(/(&lt;\/?[a-zA-Z][^&]*?&gt;)/g, '<span class="text-cyan-400">$1</span>')
      // CSV: highlight header row
      .replace(/^(.+)$/m, (match, p1, offset) => {
        if (offset === 0) return `<span class="text-cyan-400 font-semibold">${match}</span>`;
        return match;
      });
  }

  if (kind === "code") {
    return text
      // Keywords (very basic)
      .replace(/\b(function|const|let|var|return|if|else|for|while|class|import|export|from|async|await|try|catch|throw|new|this|typeof|interface|type|extends|implements)\b/g, '<span class="text-purple-400">$1</span>')
      // Strings (basic double-quoted)
      .replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, '<span class="text-emerald-400">"$1"</span>')
      // Single-quoted strings
      .replace(/'([^'\\]*(\\.[^'\\]*)*)'/g, '<span class="text-emerald-400">\'$1\'</span>')
      // Comments (// style)
      .replace(/(\/\/.*$)/gm, '<span class="text-white/30">$1</span>')
      // Numbers
      .replace(/\b(\d+\.?\d*)\b/g, '<span class="text-amber-400">$1</span>');
  }

  // text kind — keyword highlighting for LaTeX/RST
  if (kind === "text") {
    return text
      // LaTeX commands
      .replace(/(\\[a-zA-Z]+)/g, '<span class="text-cyan-400">$1</span>')
      // RST directives
      .replace(/^(\.\.[a-zA-Z-]+::)/gm, '<span class="text-purple-400">$1</span>')
      // Section markers
      .replace(/^(={3,}|-{3,}|~{3,}|\^{3,})$/gm, '<span class="text-white/30">$1</span>');
  }

  return text;
}

/** Escape HTML entities for safe rendering in <pre> */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Component ────────────────────────────────────────────────────────────────

export function FilePreview({ content, extension, mimeType, objectUrl }: FilePreviewProps) {
  const kind = detectPreviewKind(extension, mimeType);

  const { previewContent, isTruncated } = useMemo(() => {
    if (!content) return { previewContent: null, isTruncated: false };

    const bytes = new TextEncoder().encode(content).length;
    if (bytes <= MAX_PREVIEW_BYTES) {
      return { previewContent: content, isTruncated: false };
    }

    // Truncate at the byte boundary — find a safe character boundary
    const truncated = content.substring(0, Math.floor(MAX_PREVIEW_BYTES / 2));
    return { previewContent: truncated, isTruncated: true };
  }, [content]);

  // Image preview
  if (kind === "image" && objectUrl) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#1a1e25] backdrop-blur-sm overflow-hidden">
        <div className="px-3 py-2 flex items-center gap-2 border-b border-white/5">
          <Eye className="h-3.5 w-3.5 text-white/40" aria-hidden="true" />
          <span className="text-[10px] uppercase tracking-wider text-white/35 font-semibold">
            Vista previa
          </span>
        </div>
        <div className="p-3 flex items-center justify-center bg-black/20 min-h-[120px] max-h-[300px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={objectUrl}
            alt={`Vista previa de ${extension.toUpperCase()}`}
            className="max-w-full max-h-[280px] object-contain rounded"
          />
        </div>
      </div>
    );
  }

  // HTML preview — sandboxed iframe
  if (kind === "html" && previewContent) {
    const sanitized = sanitizeHtml(previewContent);
    const iframeSrc = `data:text/html;charset=utf-8,${encodeURIComponent(sanitized)}`;

    return (
      <div className="rounded-xl border border-white/10 bg-[#1a1e25] backdrop-blur-sm overflow-hidden">
        <div className="px-3 py-2 flex items-center gap-2 border-b border-white/5">
          <Eye className="h-3.5 w-3.5 text-white/40" aria-hidden="true" />
          <span className="text-[10px] uppercase tracking-wider text-white/35 font-semibold">
            Vista previa
          </span>
          {isTruncated && (
            <span className="ml-auto text-[10px] text-amber-400/80 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Vista previa parcial
            </span>
          )}
        </div>
        <iframe
          src={iframeSrc}
          sandbox=""
          title="Vista previa HTML"
          className="w-full h-64 bg-white"
        />
      </div>
    );
  }

  // Markdown preview
  if (kind === "markdown" && previewContent) {
    const rendered = renderMarkdown(previewContent);

    return (
      <div className="rounded-xl border border-white/10 bg-[#1a1e25] backdrop-blur-sm overflow-hidden">
        <div className="px-3 py-2 flex items-center gap-2 border-b border-white/5">
          <Eye className="h-3.5 w-3.5 text-white/40" aria-hidden="true" />
          <span className="text-[10px] uppercase tracking-wider text-white/35 font-semibold">
            Vista previa
          </span>
          {isTruncated && (
            <span className="ml-auto text-[10px] text-amber-400/80 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Vista previa parcial
            </span>
          )}
        </div>
        <div
          className="p-4 text-sm text-white/70 max-h-72 overflow-y-auto leading-relaxed"
          style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}
          dangerouslySetInnerHTML={{ __html: rendered }}
        />
      </div>
    );
  }

  // Code / Data / Text preview
  if ((kind === "data" || kind === "code" || kind === "text") && previewContent) {
    const escaped = escapeHtml(previewContent);
    const highlighted = highlightData(escaped, kind);

    return (
      <div className="rounded-xl border border-white/10 bg-[#1a1e25] backdrop-blur-sm overflow-hidden">
        <div className="px-3 py-2 flex items-center gap-2 border-b border-white/5">
          <Eye className="h-3.5 w-3.5 text-white/40" aria-hidden="true" />
          <span className="text-[10px] uppercase tracking-wider text-white/35 font-semibold">
            Vista previa · {extension.toUpperCase()}
          </span>
          {isTruncated && (
            <span className="ml-auto text-[10px] text-amber-400/80 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Vista previa parcial
            </span>
          )}
        </div>
        <pre
          className="p-4 text-xs text-white/60 max-h-72 overflow-auto font-mono leading-relaxed"
          style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}
          dir="ltr"
        >
          <code dangerouslySetInnerHTML={{ __html: highlighted }} />
        </pre>
      </div>
    );
  }

  // Plain text (fallback) or binary
  if (kind === "text" && previewContent) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#1a1e25] backdrop-blur-sm overflow-hidden">
        <div className="px-3 py-2 flex items-center gap-2 border-b border-white/5">
          <Eye className="h-3.5 w-3.5 text-white/40" aria-hidden="true" />
          <span className="text-[10px] uppercase tracking-wider text-white/35 font-semibold">
            Vista previa
          </span>
          {isTruncated && (
            <span className="ml-auto text-[10px] text-amber-400/80 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Vista previa parcial
            </span>
          )}
        </div>
        <pre
          className="p-4 text-xs text-white/60 max-h-72 overflow-auto font-mono leading-relaxed"
          style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}
          dir="ltr"
        >
          {previewContent}
        </pre>
      </div>
    );
  }

  // Binary / no preview available
  return (
    <div className="rounded-xl border border-white/10 bg-[#1a1e25] backdrop-blur-sm overflow-hidden">
      <div className="px-3 py-2 flex items-center gap-2 border-b border-white/5">
        <Eye className="h-3.5 w-3.5 text-white/40" aria-hidden="true" />
        <span className="text-[10px] uppercase tracking-wider text-white/35 font-semibold">
          Vista previa
        </span>
      </div>
      <div className="p-6 text-center text-white/25 text-xs">
        Vista previa no disponible para {extension.toUpperCase() || "este formato"}
      </div>
    </div>
  );
}
