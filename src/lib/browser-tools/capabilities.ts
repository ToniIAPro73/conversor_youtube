export const WEB_TOOL_CAPABILITIES = {
  images: {
    enabled: true,
    execution: "browser",
    uploads: false,
    serverConversions: false,
    inputs: ["jpeg", "jpg", "png", "webp"],
    outputs: ["jpeg", "jpg", "png", "webp"],
    operations: ["convert", "compress", "resize", "read-exif", "strip-exif", "batch"],
  },
  pdf: {
    enabled: true,
    execution: "browser",
    uploads: false,
    serverConversions: false,
    inputs: ["pdf", "jpeg", "jpg", "png", "webp"],
    outputs: ["pdf", "zip"],
    operations: ["merge", "split", "reorder", "rotate", "images-to-pdf"],
  },
  structuredData: {
    enabled: true,
    execution: "browser",
    uploads: false,
    serverConversions: false,
    inputs: ["json", "yaml", "yml", "toml", "xml", "csv", "tsv"],
    outputs: ["json", "yaml", "toml", "xml", "csv", "tsv"],
  },
} as const;

export type WebToolArea = keyof typeof WEB_TOOL_CAPABILITIES;
