import { describe, expect, it } from "vitest";
import {
  addTime,
  getState,
  pauseTimer,
  replaceState,
  resumeTimer,
  roomSignature,
  setPhase,
  setTimer,
} from "@/lib/store";
import type { SessionState } from "@/lib/types";

// C1 — authoritative timer pause. In-memory store (strongly consistent), so the
// withLock serialisation is what these exercise structurally.

const FIVE_MIN = 5 * 60_000;

function phase(state: SessionState) {
  const running = state.timerEndsAt != null;
  const paused = state.timerEndsAt == null && state.timerRemainingMs != null;
  const idle = !running && !paused;
  return { running, paused, idle };
}

async function startRunning(room: string) {
  return setTimer(Date.now() + FIVE_MIN, room);
}

describe("timer pause model", () => {
  it("exactly one of RUNNING / PAUSED / IDLE at every step", async () => {
    const room = "tp-inv";
    expect(phase(await getState(room))).toMatchObject({ idle: true });
    await startRunning(room);
    expect(phase(await getState(room))).toMatchObject({ running: true });
    await pauseTimer(room);
    expect(phase(await getState(room))).toMatchObject({ paused: true });
    await resumeTimer(room);
    expect(phase(await getState(room))).toMatchObject({ running: true });
    await setTimer(null, room);
    expect(phase(await getState(room))).toMatchObject({ idle: true });
  });

  it("pause RUNNING → PAUSED captures the remaining ms", async () => {
    const room = "tp-pause";
    await startRunning(room);
    const s = await pauseTimer(room);
    expect(s.timerEndsAt).toBeNull();
    expect(s.timerRemainingMs).toBeGreaterThan(FIVE_MIN - 2000);
    expect(s.timerRemainingMs).toBeLessThanOrEqual(FIVE_MIN);
  });

  it("resume PAUSED → RUNNING sets a fresh deadline now + remaining", async () => {
    const room = "tp-resume";
    await startRunning(room);
    const paused = await pauseTimer(room);
    const R = paused.timerRemainingMs!;
    const s = await resumeTimer(room);
    expect(s.timerRemainingMs).toBeNull();
    const delta = s.timerEndsAt! - Date.now();
    expect(delta).toBeGreaterThan(R - 2000);
    expect(delta).toBeLessThanOrEqual(R + 50);
  });

  it("addTime: running extends the deadline exactly", async () => {
    const room = "tp-add-run";
    const s1 = await startRunning(room);
    const s2 = await addTime(120_000, room);
    expect(s2.timerEndsAt).toBe(s1.timerEndsAt! + 120_000);
    expect(s2.timerRemainingMs).toBeNull();
  });

  it("addTime: paused extends the frozen remaining exactly", async () => {
    const room = "tp-add-pause";
    await startRunning(room);
    const p = await pauseTimer(room);
    const s = await addTime(120_000, room);
    expect(s.timerEndsAt).toBeNull();
    expect(s.timerRemainingMs).toBe(p.timerRemainingMs! + 120_000);
  });

  it("addTime: idle is a no-op", async () => {
    const room = "tp-add-idle";
    const s = await addTime(120_000, room);
    expect(s.timerEndsAt).toBeNull();
    expect(s.timerRemainingMs == null).toBe(true);
  });

  it("absolute setTimer clears any paused remaining", async () => {
    const room = "tp-clear";
    await startRunning(room);
    await pauseTimer(room);
    const s = await setTimer(Date.now() + 60_000, room);
    expect(s.timerRemainingMs).toBeNull();
    expect(s.timerEndsAt).not.toBeNull();
  });

  it("setPhase from a paused timer nulls BOTH fields (fresh phase, no timer)", async () => {
    const room = "tp-phase";
    await replaceState(
      {
        mode: null,
        sessionName: "T",
        phases: [
          { id: "p1", moduleId: "capture", config: { label: "A", prompt: "x" } },
          { id: "p2", moduleId: "capture", config: { label: "B", prompt: "y" } },
        ],
        phaseId: "p1",
        timerEndsAt: null,
        timerRemainingMs: null,
        readaroundIndex: 0,
        topic: "",
        ended: false,
      },
      room,
    );
    await setTimer(Date.now() + FIVE_MIN, room);
    await pauseTimer(room);
    const s = await setPhase("p2", room);
    expect(s.timerEndsAt).toBeNull();
    expect(s.timerRemainingMs).toBeNull();
  });

  it("idempotency: pause when idle and resume when running are no-ops", async () => {
    const room = "tp-idem";
    const a = await pauseTimer(room); // idle → idle
    expect(phase(a)).toMatchObject({ idle: true });
    await startRunning(room);
    const b = await resumeTimer(room); // running → running
    expect(phase(b)).toMatchObject({ running: true });
  });

  it("roomSignature changes on a +2-while-paused (so the SSE stream ticks)", async () => {
    const room = "tp-sig";
    await startRunning(room);
    await pauseTimer(room);
    const before = await roomSignature(room);
    await addTime(120_000, room);
    expect(await roomSignature(room)).not.toBe(before);
  });

  it("concurrent lead-+2 vs cohost-pause never drops time (withLock serialises)", async () => {
    const room = "tp-race";
    await startRunning(room); // ~5 min
    // Fire both at once; the lock serialises them in some order.
    await Promise.all([pauseTimer(room), addTime(120_000, room)]);
    const s = await getState(room);
    // Whatever the order, the result is PAUSED with ~5min + 2min remaining.
    expect(s.timerEndsAt).toBeNull();
    expect(s.timerRemainingMs).toBeGreaterThan(FIVE_MIN + 120_000 - 3000);
    expect(s.timerRemainingMs).toBeLessThanOrEqual(FIVE_MIN + 120_000);
  });
});
