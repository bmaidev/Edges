import { describe, expect, it } from "vitest";
import { withLock } from "@/lib/store";

// A deferred promise we control by hand — lets us hold a lock open across
// `await`s deterministically (no timers, no races on the test thread).
function deferred<T = void>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("withLock", () => {
  it("acquires, runs fn, and returns { ok: true, value }", async () => {
    const res = await withLock("room", "x", async () => 42);
    expect(res).toEqual({ ok: true, value: 42 });
  });

  it("returns { ok: false, busy: true } and does NOT run fn while held", async () => {
    const gate = deferred();
    let secondRan = false;

    // First holder parks on the gate, keeping the lock open.
    const first = withLock("room", "x", async () => {
      await gate.promise;
      return "first";
    });

    // Second contends for the same (room, name) while first is mid-flight.
    const second = await withLock("room", "x", async () => {
      secondRan = true;
      return "second";
    });

    expect(second).toEqual({ ok: false, busy: true });
    expect(secondRan).toBe(false);

    gate.resolve();
    expect(await first).toEqual({ ok: true, value: "first" });
  });

  it("can be re-acquired after the first holder releases", async () => {
    const a = await withLock("room", "x", async () => "a");
    expect(a.ok).toBe(true);
    const b = await withLock("room", "x", async () => "b");
    expect(b).toEqual({ ok: true, value: "b" });
  });

  it("does not contend across different names", async () => {
    const gate = deferred();
    const held = withLock("room", "x", async () => {
      await gate.promise;
      return "x";
    });
    const other = await withLock("room", "y", async () => "y");
    expect(other).toEqual({ ok: true, value: "y" });
    gate.resolve();
    await held;
  });

  it("does not contend across different roomIds", async () => {
    const gate = deferred();
    const held = withLock("roomA", "x", async () => {
      await gate.promise;
      return "a";
    });
    const other = await withLock("roomB", "x", async () => "b");
    expect(other).toEqual({ ok: true, value: "b" });
    gate.resolve();
    await held;
  });

  it("mutual exclusion: no lost updates among acquirers under concurrency", async () => {
    // N concurrent attempts on the same lock. Each acquired fn does a
    // read-await-write on a shared counter — the classic lost-update setup.
    // The lock must serialise them, so every acquirer's increment lands.
    const N = 10;
    let counter = 0;

    const attempts = Array.from({ length: N }, () =>
      withLock("room", "x", async () => {
        const seen = counter;
        await Promise.resolve(); // yield: would lose updates without the lock
        counter = seen + 1;
        return seen;
      }),
    );

    const results = await Promise.all(attempts);
    const acquired = results.filter((r) => r.ok);
    const busy = results.filter((r) => !r.ok);

    // At least one acquired; the rest were turned away as busy (not run).
    expect(acquired.length).toBeGreaterThanOrEqual(1);
    expect(acquired.length + busy.length).toBe(N);
    busy.forEach((r) => expect(r).toEqual({ ok: false, busy: true }));

    // The counter equals the number of acquirers — every acquired increment
    // landed, none lost. (Contended attempts correctly never ran their fn.)
    expect(counter).toBe(acquired.length);
  });
});
