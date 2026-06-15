// Unit tests for the ProgressEmitter.
// Tests: event emission, subscription, unsubscription, cancellation, replay.

import { describe, it, expect } from "vitest";
import { ProgressEmitter } from "../../src/lib/jobs/progress-emitter";
import type { JobProgressEvent } from "../../src/lib/jobs/progress-types";

function makeEvent(phase: JobProgressEvent["phase"] = "converting", progress = 50): JobProgressEvent {
  return {
    phase,
    progress,
    messageKey: "test",
  };
}

describe("ProgressEmitter — event emission", () => {
  it("emits events to subscribers", () => {
    const emitter = new ProgressEmitter();
    const received: JobProgressEvent[] = [];
    emitter.onProgress((e) => received.push(e));

    const event = makeEvent("converting", 30);
    emitter.emitProgress(event);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(event);
  });

  it("emits multiple events in order", () => {
    const emitter = new ProgressEmitter();
    const received: JobProgressEvent[] = [];
    emitter.onProgress((e) => received.push(e));

    emitter.emitProgress(makeEvent("analyzing", 10));
    emitter.emitProgress(makeEvent("converting", 50));
    emitter.emitProgress(makeEvent("validating", 90));

    expect(received).toHaveLength(3);
    expect(received[0].phase).toBe("analyzing");
    expect(received[1].phase).toBe("converting");
    expect(received[2].phase).toBe("validating");
  });

  it("delivers events to multiple subscribers", () => {
    const emitter = new ProgressEmitter();
    const received1: JobProgressEvent[] = [];
    const received2: JobProgressEvent[] = [];

    emitter.onProgress((e) => received1.push(e));
    emitter.onProgress((e) => received2.push(e));

    emitter.emitProgress(makeEvent("converting", 40));

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);
  });
});

describe("ProgressEmitter — subscription management", () => {
  it("unsubscribe stops receiving events", () => {
    const emitter = new ProgressEmitter();
    const received: JobProgressEvent[] = [];
    const unsub = emitter.onProgress((e) => received.push(e));

    emitter.emitProgress(makeEvent("converting", 20));
    expect(received).toHaveLength(1);

    unsub();
    emitter.emitProgress(makeEvent("converting", 40));
    expect(received).toHaveLength(1); // No new event after unsubscribe
  });

  it("replays last event to new subscriber", () => {
    const emitter = new ProgressEmitter();
    emitter.emitProgress(makeEvent("converting", 60));

    const received: JobProgressEvent[] = [];
    emitter.onProgress((e) => received.push(e));

    expect(received).toHaveLength(1);
    expect(received[0].progress).toBe(60);
  });

  it("tracks subscriber count", () => {
    const emitter = new ProgressEmitter();
    expect(emitter.subscriberCount).toBe(0);

    const unsub1 = emitter.onProgress(() => {});
    expect(emitter.subscriberCount).toBe(1);

    const unsub2 = emitter.onProgress(() => {});
    expect(emitter.subscriberCount).toBe(2);

    unsub1();
    expect(emitter.subscriberCount).toBe(1);

    unsub2();
    expect(emitter.subscriberCount).toBe(0);
  });
});

describe("ProgressEmitter — cancellation via AbortSignal", () => {
  it("stops emitting after abort", () => {
    const controller = new AbortController();
    const emitter = new ProgressEmitter(controller.signal);
    const received: JobProgressEvent[] = [];

    emitter.onProgress((e) => received.push(e));

    emitter.emitProgress(makeEvent("converting", 30));
    expect(received).toHaveLength(1);

    controller.abort();
    // Abort emits a cancellation event, so now we have 2 events
    const countAfterAbort = received.length;

    // Emit after abort — should be no-op
    emitter.emitProgress(makeEvent("converting", 50));
    expect(received).toHaveLength(countAfterAbort);
  });

  it("emits cancellation event on abort", () => {
    const controller = new AbortController();
    const emitter = new ProgressEmitter(controller.signal);
    const received: JobProgressEvent[] = [];

    emitter.onProgress((e) => received.push(e));

    controller.abort();

    // The abort handler emits a cancel event
    expect(received).toHaveLength(1);
    expect(received[0].messageKey).toBe("cancelled");
    expect(received[0].progress).toBe(-1);
  });

  it("isAborted reflects abort state", () => {
    const controller = new AbortController();
    const emitter = new ProgressEmitter(controller.signal);
    expect(emitter.isAborted).toBe(false);

    controller.abort();
    expect(emitter.isAborted).toBe(true);
  });

  it("onProgress returns no-op unsubscribe after abort", () => {
    const controller = new AbortController();
    const emitter = new ProgressEmitter(controller.signal);
    controller.abort();

    const received: JobProgressEvent[] = [];
    const unsub = emitter.onProgress((e) => received.push(e));

    emitter.emitProgress(makeEvent("converting", 10));
    expect(received).toHaveLength(0); // No events after abort
    unsub(); // Should not throw
  });
});

describe("ProgressEmitter — dispose", () => {
  it("dispose clears subscribers and marks aborted", () => {
    const emitter = new ProgressEmitter();
    const received: JobProgressEvent[] = [];
    emitter.onProgress((e) => received.push(e));

    emitter.emitProgress(makeEvent("converting", 30));
    expect(received).toHaveLength(1);

    emitter.dispose();
    expect(emitter.isAborted).toBe(true);
    expect(emitter.subscriberCount).toBe(0);

    emitter.emitProgress(makeEvent("converting", 50));
    expect(received).toHaveLength(1);
  });
});

describe("ProgressEmitter — last event", () => {
  it("tracks last emitted event", () => {
    const emitter = new ProgressEmitter();
    expect(emitter.last).toBeNull();

    const event = makeEvent("converting", 75);
    emitter.emitProgress(event);
    expect(emitter.last).toEqual(event);
  });
});

describe("ProgressEmitter — callback error handling", () => {
  it("swallows errors from callbacks and continues", () => {
    const emitter = new ProgressEmitter();
    const received: JobProgressEvent[] = [];

    emitter.onProgress(() => { throw new Error("boom"); });
    emitter.onProgress((e) => received.push(e));

    emitter.emitProgress(makeEvent("converting", 30));
    // Second callback should still receive the event
    expect(received).toHaveLength(1);
  });
});
