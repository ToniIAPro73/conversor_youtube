export const messages = {
  // Navigation
  "nav.convert": "Convert",
  "nav.history": "History",
  "nav.diagnostics": "Diagnostics",

  // Source selector
  "source.title": "Local multimedia",
  "source.subtitle": "Audio, video, images, documents, data and more",
  "source.url.tab": "From URL",
  "source.file.tab": "Local file",
  "source.drop.idle": "Drop a file here or click to select",
  "source.drop.dragValid": "Drop the file to analyze it",
  "source.drop.dragInvalid": "Unsupported file type",
  "source.drop.uploading": "Analyzing file...",
  "source.drop.error": "Error processing file",

  // Analysis
  "analysis.category.audio": "Audio",
  "analysis.category.video": "Video",
  "analysis.category.image": "Image",
  "analysis.category.document": "Document",
  "analysis.category.spreadsheet": "Spreadsheet",
  "analysis.category.presentation": "Presentation",
  "analysis.category.pdf": "PDF",
  "analysis.category.ebook": "Ebook",
  "analysis.category.archive": "Compressed archive",
  "analysis.category.structured-data": "Structured data",
  "analysis.category.plain-text": "Text",

  // Loss profiles
  "loss.lossless": "Lossless",
  "loss.metadata-risk": "Metadata risk",
  "loss.layout-risk": "Layout risk",
  "loss.lossy": "Lossy",
  "loss.experimental": "Experimental",

  // Progress phases
  "progress.queued": "Queued",
  "progress.acquiring": "Acquiring",
  "progress.analyzing": "Analyzing",
  "progress.converting": "Converting",
  "progress.validating": "Validating",
  "progress.packaging": "Packaging",

  // Errors
  "error.tool-not-available": "Tool not available",
  "error.input-unsupported": "Unsupported input format",
  "error.process-timeout": "Process timed out",
  "error.process-cancelled": "Conversion cancelled",
  "error.validation-failed": "Output validation failed",
  "error.generic": "Conversion error",

  // Format selector
  "format.select": "Select output format",
  "format.recommended": "Recommended",

  // Conversion
  "convert.start": "Convert",
  "convert.cancel": "Cancel",
  "convert.download": "Download",
  "convert.new": "New conversion",
  "convert.rights": "I confirm I have rights to this content",

  // Diagnostics
  "diagnostics.title": "Tool diagnostics",
  "diagnostics.available": "Available",
  "diagnostics.missing": "Not found",
  "diagnostics.version": "Version",
  "diagnostics.action": "Recommended action",
  "diagnostics.refresh": "Refresh",
  "diagnostics.summary": "{available} of {total} tools available",

  // History
  "history.title": "Conversion history",
  "history.all": "All",
  "history.completed": "Completed",
  "history.failed": "Failed",
  "history.expired": "File expired",
  "history.empty": "No conversions in history",

  // General
  "general.bytes": "{n} bytes",
  "general.kb": "{n} KB",
  "general.mb": "{n} MB",

  // Web mode — dropzone
  "web.dropzone.idle": "Drop a file here or select one",
  "web.dropzone.drag-active": "Drop the file to continue",
  "web.dropzone.drag-invalid": "Unsupported file",
  "web.dropzone.formats": "Web formats: JSON, YAML, TOML, XML, CSV and TSV",
  "web.dropzone.max-size": "Maximum size: 1 MB",
  "web.dropzone.too-large": "The file is too large. The Web version supports up to 1 MB.",
  "web.dropzone.unsupported": "Unsupported file. Use JSON, YAML, TOML, XML, CSV or TSV.",

  // Web mode — conversion
  "web.convert.done": "Conversion complete. Your file was converted in this browser and is ready to download.",
  "web.convert.converting": "Converting…",
  "web.convert.another": "Convert another file",

  // Web mode — privacy
  "web.privacy.title": "Your files never leave your device",
  "web.privacy.body": "The conversion happens entirely in this browser. We never send your file to our servers, and we do not store a copy.",

  // Web mode — desktop required
  "web.desktop.title": "These conversions require the Desktop app",
  "web.desktop.cta": "Download FileStudio for Windows or Linux to use these formats.",

  // Web mode — links
  "web.link.windows": "Windows",
  "web.link.linux": "Linux",
  "web.link.support": "Help",
  "web.link.windows-disabled": "Download coming soon",
  "web.link.linux-disabled": "Download coming soon",
  "web.link.support-disabled": "Support not yet configured",

  // Web mode — CSV warnings
  "web.csv.nested-warning": "Some values contain nested structures. They have been serialized as JSON text inside the cell.",
  "web.csv.root-invalid": "Cannot create CSV from this content. The file must contain a list of records (array of objects).",

  // Quality selector
  "quality.sourceMax": "Maximum original quality",
  "quality.mp4Compatible": "MP4 compatible",
  "quality.maxAvailable": "Max available",
  "quality.profileSourceMaxDesc": "No re-encoding · preserves 4K/60fps · may produce MKV/WebM",
  "quality.profileMp4Desc": "Compatible with more players · may require re-encoding",
  "quality.resolutionNotDelivered": "Delivered resolution ({delivered}p) lower than requested ({requested}p)",
} as const;

export type MessageKey = keyof typeof messages;
