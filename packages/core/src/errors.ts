// Copied from src/lib/errors/error-codes.ts — canonical source for packages/core consumers.

export type ErrorCode =
  | "TOOL_NOT_AVAILABLE"
  | "INPUT_UNSUPPORTED"
  | "INPUT_CORRUPTED"
  | "CAPABILITY_NOT_AVAILABLE"
  | "OUTPUT_FORMAT_INVALID"
  | "PROCESS_TIMEOUT"
  | "PROCESS_CANCELLED"
  | "ARTIFACT_VALIDATION_FAILED"
  | "INSUFFICIENT_DISK_SPACE"
  | "ARCHIVE_UNSAFE"
  | "OCR_LANGUAGE_MISSING"
  | "BATCH_PARTIAL_FAILURE"
  | "JOB_NOT_FOUND"
  | "ENGINE_NOT_FOUND"
  | "ENGINE_UNAVAILABLE"
  | "UNSAFE_PATH"
  | "ENGINE_EXECUTE_FAILED"
  | "VALIDATION_FAILED"
  | "INPUT_NOT_FOUND"
  | "MISSING_CONVERSION_ID"
  | "INVALID_STATE"
  | "RATE_LIMITED"
  | "CONCURRENCY_LIMIT"
  // Service-specific codes
  | "UPLOAD_NOT_FOUND"
  | "UPLOAD_TOO_LARGE"
  | "UPLOAD_EXPIRED"
  | "UPLOAD_MIME_REJECTED"
  | "AUTH_INVALID_TOKEN"
  | "AUTH_EXPIRED_TOKEN"
  | "AUTH_INSUFFICIENT_SCOPE"
  | "AUTH_CLIENT_SUSPENDED"
  | "IDEMPOTENCY_CONFLICT"
  | "WEBHOOK_SSRF_BLOCKED"
  | "OPERATION_UNAVAILABLE"
  | "QUOTA_EXCEEDED"
  | "TENANT_ISOLATION_VIOLATION";

export interface AppError extends Error {
  code: ErrorCode;
  stage: string;
  engineId?: string;
  retryable: boolean;
  technicalDetail?: string;
}

const RETRYABLE_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "PROCESS_TIMEOUT",
  "ENGINE_UNAVAILABLE",
  "INSUFFICIENT_DISK_SPACE",
  "RATE_LIMITED",
  "CONCURRENCY_LIMIT",
]);

export function isRetryable(code: ErrorCode): boolean {
  return RETRYABLE_CODES.has(code);
}

export function createAppError(
  code: ErrorCode,
  message: string,
  options: {
    stage?: string;
    engineId?: string;
    retryable?: boolean;
    technicalDetail?: string;
    cause?: Error;
  } = {}
): AppError {
  const err = new Error(message) as AppError;
  err.name = "AppError";
  err.code = code;
  err.stage = options.stage ?? "unknown";
  err.engineId = options.engineId;
  err.retryable = options.retryable ?? isRetryable(code);
  err.technicalDetail = options.technicalDetail;
  if (options.cause) err.cause = options.cause;
  return err;
}

export const ERROR_MESSAGES: Readonly<Record<ErrorCode, string>> = {
  TOOL_NOT_AVAILABLE: "La herramienta necesaria no está instalada.",
  INPUT_UNSUPPORTED: "El archivo de entrada no es compatible.",
  INPUT_CORRUPTED: "El archivo de entrada está corrupto o no se puede leer.",
  CAPABILITY_NOT_AVAILABLE: "La conversión solicitada no está disponible.",
  OUTPUT_FORMAT_INVALID: "El formato de salida solicitado no es válido.",
  PROCESS_TIMEOUT: "La conversión ha tardado demasiado tiempo.",
  PROCESS_CANCELLED: "El proceso ha sido cancelado.",
  ARTIFACT_VALIDATION_FAILED: "No se pudo verificar el archivo generado.",
  INSUFFICIENT_DISK_SPACE: "No hay suficiente espacio en disco para realizar la conversión.",
  ARCHIVE_UNSAFE: "El archivo comprimido contiene entradas inseguras.",
  OCR_LANGUAGE_MISSING: "Falta el idioma requerido para el reconocimiento óptico de caracteres.",
  BATCH_PARTIAL_FAILURE: "Algunas conversiones del lote han fallado.",
  JOB_NOT_FOUND: "El proceso no existe o ha sido eliminado.",
  ENGINE_NOT_FOUND: "El motor de conversión no fue encontrado.",
  ENGINE_UNAVAILABLE: "El motor de conversión no está disponible en este momento.",
  UNSAFE_PATH: "La ruta del archivo no es segura.",
  ENGINE_EXECUTE_FAILED: "Error durante la ejecución del motor de conversión.",
  VALIDATION_FAILED: "La validación del archivo de salida ha fallado.",
  INPUT_NOT_FOUND: "El archivo de entrada no fue encontrado.",
  MISSING_CONVERSION_ID: "Falta el identificador de conversión.",
  INVALID_STATE: "El estado del proceso no es válido para esta operación.",
  RATE_LIMITED: "Demasiadas peticiones. Por favor, espera un momento.",
  CONCURRENCY_LIMIT: "Se ha alcanzado el límite de conversiones simultáneas.",
  UPLOAD_NOT_FOUND: "El archivo subido no existe o ha expirado.",
  UPLOAD_TOO_LARGE: "El archivo supera el límite de tamaño permitido.",
  UPLOAD_EXPIRED: "El archivo subido ha expirado.",
  UPLOAD_MIME_REJECTED: "El tipo de archivo no está permitido.",
  AUTH_INVALID_TOKEN: "Token de autenticación inválido.",
  AUTH_EXPIRED_TOKEN: "Token de autenticación expirado.",
  AUTH_INSUFFICIENT_SCOPE: "Sin permisos suficientes para esta operación.",
  AUTH_CLIENT_SUSPENDED: "El cliente de servicio está suspendido.",
  IDEMPOTENCY_CONFLICT: "La clave de idempotencia ya fue usada con un payload diferente.",
  WEBHOOK_SSRF_BLOCKED: "La URL del webhook no está permitida por razones de seguridad.",
  OPERATION_UNAVAILABLE: "La operación no está disponible (motor no instalado).",
  QUOTA_EXCEEDED: "Cuota de uso agotada.",
  TENANT_ISOLATION_VIOLATION: "Acceso no autorizado a recursos de otro cliente.",
};
