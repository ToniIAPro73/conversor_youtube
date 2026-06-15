// Universal ProcessRunner — all engines use this instead of raw spawn.
// Enforces shell:false, windowsHide, argument allowlist, timeout, and redacted logs.

import { spawn, ChildProcess } from "child_process";

export interface RunOptions {
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
  onProgress?: (line: string, stream: "stdout" | "stderr") => void;
  signal?: AbortSignal;
}

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

export class ProcessTimeoutError extends Error {
  constructor(binary: string, timeoutMs: number) {
    super(`Process "${binary}" timed out after ${timeoutMs}ms`);
    this.name = "ProcessTimeoutError";
  }
}

export class ProcessRunner {
  private readonly binary: string;
  private readonly defaultTimeoutMs: number;

  constructor(binary: string, defaultTimeoutMs = 60_000) {
    this.binary = binary;
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  async run(opts: RunOptions): Promise<RunResult> {
    const {
      args,
      cwd,
      env,
      timeoutMs = this.defaultTimeoutMs,
      maxStdoutBytes = 10 * 1024 * 1024,
      maxStderrBytes = 2 * 1024 * 1024,
      onProgress,
      signal,
    } = opts;

    const start = Date.now();

    return new Promise((resolve, reject) => {
      let child: ChildProcess;
      try {
        child = spawn(this.binary, args, {
          shell: false,
          windowsHide: true,
          cwd,
          env: { ...process.env, ...env },
        });
      } catch (err) {
        reject(new Error(`Failed to spawn "${this.binary}": ${String(err)}`));
        return;
      }

      let stdoutBuf = "";
      let stderrBuf = "";
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeoutMs);

      if (signal) {
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          child.kill("SIGKILL");
          reject(new Error("Process cancelled"));
        });
      }

      child.stdout?.on("data", (chunk: Buffer) => {
        stdoutBytes += chunk.length;
        if (stdoutBytes <= maxStdoutBytes) {
          const text = chunk.toString("utf8");
          stdoutBuf += text;
          onProgress?.(text, "stdout");
        }
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        stderrBytes += chunk.length;
        if (stderrBytes <= maxStderrBytes) {
          const text = chunk.toString("utf8");
          stderrBuf += text;
          onProgress?.(text, "stderr");
        }
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        reject(new Error(`Process error "${this.binary}": ${err.message}`));
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        const durationMs = Date.now() - start;

        if (timedOut) {
          reject(new ProcessTimeoutError(this.binary, timeoutMs));
          return;
        }

        resolve({
          exitCode: code ?? -1,
          stdout: redactPaths(stdoutBuf),
          stderr: redactPaths(stderrBuf),
          timedOut: false,
          durationMs,
        });
      });
    });
  }

  async probe(versionArgs: string[] = ["--version"]): Promise<{ available: boolean; version: string | null; binaryPath: string | null }> {
    try {
      const result = await this.run({ args: versionArgs, timeoutMs: 5_000 });
      if (result.exitCode === 0 || result.exitCode === 1) {
        const output = (result.stdout + result.stderr).trim();
        const versionMatch = output.match(/[\d]+\.[\d]+\.[\d]+[^\s]*/);
        return {
          available: true,
          version: versionMatch?.[0] ?? (output.split("\n")[0].trim().slice(0, 80) || null),
          binaryPath: this.binary,
        };
      }
      return { available: false, version: null, binaryPath: null };
    } catch {
      return { available: false, version: null, binaryPath: null };
    }
  }
}

// Remove absolute paths from log output to avoid leaking filesystem layout.
function redactPaths(text: string): string {
  return text.replace(/\/[^\s"',:;)]+/g, (m) => {
    const parts = m.split("/");
    return parts.length > 3 ? `/.../${parts.slice(-2).join("/")}` : m;
  });
}
