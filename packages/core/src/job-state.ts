// Job state machine — valid states and allowed transitions.
// Shared between Desktop (in-process queue) and Service (BullMQ + PostgreSQL).

export type JobStatus =
  | "created"
  | "validating"
  | "queued"
  | "leased"
  | "processing"
  | "cancelling"
  | "completed"
  | "partial_failure"
  | "failed"
  | "cancelled"
  | "expired"
  | "deleted";

export const TERMINAL_STATUSES: ReadonlySet<JobStatus> = new Set([
  "completed",
  "partial_failure",
  "failed",
  "cancelled",
  "expired",
  "deleted",
]);

export function isTerminal(status: JobStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

// Valid transitions: from → Set of allowed next states
const VALID_TRANSITIONS: ReadonlyMap<JobStatus, ReadonlySet<JobStatus>> = new Map([
  ["created",        new Set<JobStatus>(["validating", "cancelled"])],
  ["validating",     new Set<JobStatus>(["queued", "failed"])],
  ["queued",         new Set<JobStatus>(["leased", "cancelling"])],
  ["leased",         new Set<JobStatus>(["processing", "queued", "cancelling"])], // queued = re-enqueue on worker death
  ["processing",     new Set<JobStatus>(["completed", "partial_failure", "failed", "cancelling"])],
  ["cancelling",     new Set<JobStatus>(["cancelled"])],
  ["completed",      new Set<JobStatus>(["expired"])],
  ["partial_failure",new Set<JobStatus>(["expired"])],
  ["failed",         new Set<JobStatus>(["expired"])],
  ["cancelled",      new Set<JobStatus>(["expired"])],
  ["expired",        new Set<JobStatus>(["deleted"])],
  ["deleted",        new Set<JobStatus>()],
]);

export function isValidTransition(from: JobStatus, to: JobStatus): boolean {
  return VALID_TRANSITIONS.get(from)?.has(to) ?? false;
}

export function assertValidTransition(from: JobStatus, to: JobStatus): void {
  if (!isValidTransition(from, to)) {
    throw new Error(`Invalid job state transition: ${from} → ${to}`);
  }
}
