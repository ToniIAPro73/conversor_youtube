const EXTENSION_RE = /\.[^.\\/]+$/;

export function sanitizeDownloadName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140) || "archivo";
}

export function basenameWithoutExtension(name: string): string {
  return sanitizeDownloadName(name.replace(EXTENSION_RE, ""));
}

export function withExtension(name: string, extension: string): string {
  const ext = extension.startsWith(".") ? extension.slice(1) : extension;
  return `${basenameWithoutExtension(name)}.${ext.toLowerCase()}`;
}

export function uniqueName(name: string, used: Set<string>): string {
  const safe = sanitizeDownloadName(name);
  if (!used.has(safe)) {
    used.add(safe);
    return safe;
  }
  const match = safe.match(/^(.*?)(\.[^.]+)?$/);
  const stem = match?.[1] || "archivo";
  const ext = match?.[2] || "";
  let index = 2;
  while (used.has(`${stem}-${index}${ext}`)) index += 1;
  const next = `${stem}-${index}${ext}`;
  used.add(next);
  return next;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}
