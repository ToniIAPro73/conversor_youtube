export const messages = {
  // Navigation
  "nav.convert": "Convertir",
  "nav.history": "Historial",
  "nav.diagnostics": "Diagnóstico",

  // Source selector
  "source.title": "Multimedia local",
  "source.subtitle": "Audio, vídeo, imágenes, documentos, datos y más",
  "source.url.tab": "Desde enlace",
  "source.file.tab": "Archivo local",
  "source.drop.idle": "Arrastra un archivo aquí o haz clic para seleccionar",
  "source.drop.dragValid": "Suelta el archivo para analizarlo",
  "source.drop.dragInvalid": "Tipo de archivo no soportado",
  "source.drop.uploading": "Analizando archivo...",
  "source.drop.error": "Error al procesar el archivo",

  // Analysis
  "analysis.category.audio": "Audio",
  "analysis.category.video": "Vídeo",
  "analysis.category.image": "Imagen",
  "analysis.category.document": "Documento",
  "analysis.category.spreadsheet": "Hoja de cálculo",
  "analysis.category.presentation": "Presentación",
  "analysis.category.pdf": "PDF",
  "analysis.category.ebook": "Ebook",
  "analysis.category.archive": "Archivo comprimido",
  "analysis.category.structured-data": "Datos estructurados",
  "analysis.category.plain-text": "Texto",

  // Loss profiles
  "loss.lossless": "Sin pérdida",
  "loss.metadata-risk": "Riesgo de metadatos",
  "loss.layout-risk": "Riesgo de formato",
  "loss.lossy": "Con pérdida",
  "loss.experimental": "Experimental",

  // Progress phases
  "progress.queued": "En cola",
  "progress.acquiring": "Adquiriendo",
  "progress.analyzing": "Analizando",
  "progress.converting": "Convirtiendo",
  "progress.validating": "Validando",
  "progress.packaging": "Empaquetando",

  // Errors
  "error.tool-not-available": "Herramienta no disponible",
  "error.input-unsupported": "Formato de entrada no soportado",
  "error.process-timeout": "Tiempo de espera agotado",
  "error.process-cancelled": "Conversión cancelada",
  "error.validation-failed": "La validación del resultado falló",
  "error.generic": "Error en la conversión",

  // Format selector
  "format.select": "Selecciona formato de salida",
  "format.recommended": "Recomendado",

  // Conversion
  "convert.start": "Convertir",
  "convert.cancel": "Cancelar",
  "convert.download": "Descargar",
  "convert.new": "Nueva conversión",
  "convert.rights": "Confirmo que tengo derechos sobre este contenido",

  // Diagnostics
  "diagnostics.title": "Diagnóstico de herramientas",
  "diagnostics.available": "Disponible",
  "diagnostics.missing": "No encontrado",
  "diagnostics.version": "Versión",
  "diagnostics.action": "Acción recomendada",
  "diagnostics.refresh": "Actualizar",
  "diagnostics.summary": "{available} de {total} herramientas disponibles",

  // History
  "history.title": "Historial de conversiones",
  "history.all": "Todas",
  "history.completed": "Completadas",
  "history.failed": "Fallidas",
  "history.expired": "Archivo expirado",
  "history.empty": "No hay conversiones en el historial",

  // General
  "general.bytes": "{n} bytes",
  "general.kb": "{n} KB",
  "general.mb": "{n} MB",

  // Web mode — dropzone
  "web.dropzone.idle": "Arrastra el archivo aquí o selecciona uno",
  "web.dropzone.drag-active": "Suelta el archivo para continuar",
  "web.dropzone.drag-invalid": "Archivo no compatible",
  "web.dropzone.formats": "Formatos Web: JSON, YAML, TOML, XML, CSV y TSV",
  "web.dropzone.max-size": "Tamaño máximo: 1 MB",
  "web.dropzone.too-large": "El archivo es demasiado grande. La versión Web admite hasta 1 MB.",
  "web.dropzone.unsupported": "Archivo no compatible. Usa JSON, YAML, TOML, XML, CSV o TSV.",

  // Web mode — conversion
  "web.convert.done": "Conversión completada. Tu archivo se ha convertido en este navegador y ya está listo para descargar.",
  "web.convert.converting": "Convirtiendo…",
  "web.convert.another": "Convertir otro archivo",

  // Web mode — privacy
  "web.privacy.title": "Tus archivos no salen de tu equipo",
  "web.privacy.body": "La conversión se realiza directamente en este navegador. No enviamos el archivo a nuestros servidores y no guardamos una copia.",

  // Web mode — desktop required
  "web.desktop.title": "Para estas conversiones necesitas la aplicación Desktop",
  "web.desktop.cta": "Descarga FileStudio para Windows o Linux para usar estos formatos.",

  // Web mode — links
  "web.link.windows": "Windows",
  "web.link.linux": "Linux",
  "web.link.support": "Ayuda",
  "web.link.windows-disabled": "Descarga próximamente",
  "web.link.linux-disabled": "Descarga próximamente",
  "web.link.support-disabled": "Soporte aún no configurado",

  // Web mode — CSV warnings
  "web.csv.nested-warning": "Algunos valores contienen estructuras anidadas. Se han serializado como texto JSON dentro de la celda.",
  "web.csv.root-invalid": "No se puede crear un CSV con este contenido. Para convertir a CSV, el archivo debe contener una lista de registros.",

  // Quality selector
  "quality.sourceMax": "Máxima calidad original",
  "quality.mp4Compatible": "MP4 compatible",
  "quality.maxAvailable": "Máx disponible",
  "quality.profileSourceMaxDesc": "Sin recodificación · preserva 4K/60fps · puede ser MKV/WebM",
  "quality.profileMp4Desc": "Compatible con más reproductores · puede requerir recodificación",
  "quality.resolutionNotDelivered": "Resolución entregada ({delivered}p) inferior a la solicitada ({requested}p)",
} as const;

export type MessageKey = keyof typeof messages;
