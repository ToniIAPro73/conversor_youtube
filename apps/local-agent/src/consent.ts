// Consent policy engine — decides whether to accept a job without user prompt.
import type { AgentJob, AgentConfig, ConsentPolicy } from "./types.js";

export interface ConsentDecision {
  approved: boolean;
  reason: string;
}

export interface ConsentUI {
  prompt(job: AgentJob): Promise<boolean>;
}

export class ConsentEngine {
  constructor(
    private readonly config: AgentConfig,
    private readonly ui: ConsentUI
  ) {}

  async evaluate(job: AgentJob): Promise<ConsentDecision> {
    const policy: ConsentPolicy = this.config.policy;

    if (policy === "disabled") {
      return { approved: false, reason: "Agent is paused (policy=disabled)" };
    }

    if (job.inputSizeBytes > this.config.maxFileSizeBytes) {
      return {
        approved: false,
        reason: `File too large: ${job.inputSizeBytes} > max ${this.config.maxFileSizeBytes}`,
      };
    }

    if (policy === "allow-approved-operations") {
      if (this.config.approvedOperations.includes(job.operation)) {
        return { approved: true, reason: "auto-approved (whitelisted operation)" };
      }
      // Falls through to UI prompt for unknown operations
    }

    // ask-always or unknown operation in allow-approved-operations
    const userApproved = await this.ui.prompt(job);
    return {
      approved: userApproved,
      reason: userApproved ? "user-approved" : "user-rejected",
    };
  }
}

// ── Console UI (default for daemon/CLI mode) ──────────────────────────────────

export class ConsoleConsentUI implements ConsentUI {
  async prompt(job: AgentJob): Promise<boolean> {
    // In daemon mode with no TTY, auto-reject to prevent hanging
    if (!process.stdin.isTTY) {
      console.warn(`[consent] No TTY — auto-rejecting job ${job.id} (policy=ask-always requires interactive terminal)`);
      return false;
    }

    console.log(`\n╔══════════════════════════════════════╗`);
    console.log(`║  CONVERSION REQUEST                  ║`);
    console.log(`╠══════════════════════════════════════╣`);
    console.log(`║  Org:       ${pad(job.requestingOrg, 24)}║`);
    console.log(`║  App:       ${pad(job.requestingApp, 24)}║`);
    console.log(`║  Operation: ${pad(job.operation, 24)}║`);
    console.log(`║  File:      ${pad(job.inputFilename, 24)}║`);
    console.log(`║  Size:      ${pad(formatBytes(job.inputSizeBytes), 24)}║`);
    console.log(`║  Retention: ${pad(`${job.retentionMinutes} min`, 24)}║`);
    console.log(`╠══════════════════════════════════════╣`);
    console.log(`║  [y] Accept   [n] Reject             ║`);
    console.log(`╚══════════════════════════════════════╝`);
    process.stdout.write("Your choice [y/n]: ");

    return new Promise((resolve) => {
      const onData = (chunk: Buffer) => {
        const input = chunk.toString().trim().toLowerCase();
        process.stdin.off("data", onData);
        process.stdin.setRawMode?.(false);
        console.log();
        resolve(input === "y" || input === "yes");
      };
      process.stdin.setRawMode?.(true);
      process.stdin.resume();
      process.stdin.once("data", onData);
    });
  }
}

function pad(s: string, len: number): string {
  return s.length > len ? s.slice(0, len - 1) + "…" : s.padEnd(len);
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
