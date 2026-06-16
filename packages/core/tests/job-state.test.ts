import { describe, it, expect } from "vitest";
import {
  isValidTransition,
  assertValidTransition,
  isTerminal,
  TERMINAL_STATUSES,
  type JobStatus,
} from "../src/job-state.js";

describe("JobStatus — terminal states", () => {
  it("marks completed as terminal", () => {
    expect(isTerminal("completed")).toBe(true);
  });

  it("marks failed as terminal", () => {
    expect(isTerminal("failed")).toBe(true);
  });

  it("marks cancelled as terminal", () => {
    expect(isTerminal("cancelled")).toBe(true);
  });

  it("marks deleted as terminal", () => {
    expect(isTerminal("deleted")).toBe(true);
  });

  it("does not mark processing as terminal", () => {
    expect(isTerminal("processing")).toBe(false);
  });

  it("does not mark queued as terminal", () => {
    expect(isTerminal("queued")).toBe(false);
  });

  it("TERMINAL_STATUSES has 6 members", () => {
    expect(TERMINAL_STATUSES.size).toBe(6);
  });
});

describe("isValidTransition — valid paths", () => {
  const validPaths: Array<[JobStatus, JobStatus]> = [
    ["created", "validating"],
    ["created", "cancelled"],
    ["validating", "queued"],
    ["validating", "failed"],
    ["queued", "leased"],
    ["queued", "cancelling"],
    ["leased", "processing"],
    ["leased", "queued"],
    ["leased", "cancelling"],
    ["processing", "completed"],
    ["processing", "partial_failure"],
    ["processing", "failed"],
    ["processing", "cancelling"],
    ["cancelling", "cancelled"],
    ["completed", "expired"],
    ["failed", "expired"],
    ["cancelled", "expired"],
    ["expired", "deleted"],
  ];

  for (const [from, to] of validPaths) {
    it(`allows ${from} → ${to}`, () => {
      expect(isValidTransition(from, to)).toBe(true);
    });
  }
});

describe("isValidTransition — invalid paths", () => {
  const invalidPaths: Array<[JobStatus, JobStatus]> = [
    ["created", "processing"],
    ["created", "completed"],
    ["queued", "completed"],
    ["completed", "processing"],
    ["failed", "processing"],
    ["deleted", "created"],
    ["processing", "created"],
    ["cancelled", "processing"],
  ];

  for (const [from, to] of invalidPaths) {
    it(`rejects ${from} → ${to}`, () => {
      expect(isValidTransition(from, to)).toBe(false);
    });
  }
});

describe("assertValidTransition", () => {
  it("does not throw on valid transition", () => {
    expect(() => assertValidTransition("created", "validating")).not.toThrow();
  });

  it("throws on invalid transition with descriptive message", () => {
    expect(() => assertValidTransition("completed", "processing"))
      .toThrow("Invalid job state transition: completed → processing");
  });
});
