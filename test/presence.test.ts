import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET as stateGET } from "@/app/api/r/[room]/state/route";
import {
  endSession,
  heartbeatHost,
  readHostPresence,
  setPhases,
} from "@/lib/store";
import { liveRoster, PRESENCE_TTL_MS, roleLabel } from "@/lib/presence";
import { createRoom } from "@/lib/rooms";

// C5 — co-facilitation presence. The guarantees: a host heartbeat is server-role
// authoritative (the client never dictates its tier), the roster ages out, and
// the "burn now" end-wipe clears it. Host presence is host-only — it must never
// reach the participant/projector surface.

beforeAll(() => {
  process.env.ADMIN_PASSCODE = "test-super-admin-presence";
});

describe("liveRoster (pure)", () => {
  const now = 1_000_000;
  it("keeps recent entries, drops stale ones, skips malformed", () => {
    const raw = {
      a: { presenceId: "a", name: "Sam", role: "facilitator", lastSeen: now - 1000 },
      b: { presenceId: "b", name: "", role: "cohost", lastSeen: now - PRESENCE_TTL_MS - 1 }, // stale
      c: { presenceId: "c", role: "facilitator", lastSeen: now - 500 }, // no name → ""
      junk: { nope: true },
      nul: null,
    };
    const live = liveRoster(raw, now);
    expect(live.map((p) => p.presenceId)).toEqual(["a", "c"]); // b aged out, junk/nul skipped
    expect(live.find((p) => p.presenceId === "c")?.name).toBe("");
  });

  it("sorts by presenceId so the strip never reshuffles on a heartbeat", () => {
    const raw = {
      z: { presenceId: "z", role: "facilitator", lastSeen: now },
      a: { presenceId: "a", role: "cohost", lastSeen: now },
    };
    expect(liveRoster(raw, now).map((p) => p.presenceId)).toEqual(["a", "z"]);
  });

  it("roleLabel names each tier", () => {
    expect(roleLabel("facilitator")).toBe("Facilitator");
    expect(roleLabel("cohost")).toBe("Co-host");
    expect(roleLabel("admin")).toBe("Admin");
  });
});

describe("heartbeatHost + readHostPresence", () => {
  it("upserts a present host and lists it live", async () => {
    const { room } = await createRoom("T", "t");
    await heartbeatHost("p1", "Dana", "facilitator", room.slug);
    const live = await readHostPresence(room.slug);
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ presenceId: "p1", name: "Dana", role: "facilitator" });
  });

  it("two consoles → two entries (solo vs co-facilitated)", async () => {
    const { room } = await createRoom("T", "t");
    await heartbeatHost("p1", "Dana", "facilitator", room.slug);
    expect(await readHostPresence(room.slug)).toHaveLength(1); // solo
    await heartbeatHost("p2", "Sam", "cohost", room.slug);
    expect(await readHostPresence(room.slug)).toHaveLength(2); // co-facilitated
  });

  it("throttles repeat writes (a second heartbeat in the window is skipped)", async () => {
    const { room } = await createRoom("T", "t");
    await heartbeatHost("p1", "Dana", "facilitator", room.slug);
    // Same id again immediately, different name → throttled, so the name doesn't change.
    await heartbeatHost("p1", "Renamed", "facilitator", room.slug);
    const live = await readHostPresence(room.slug);
    expect(live).toHaveLength(1);
    expect(live[0].name).toBe("Dana");
  });

  it("the end-wipe clears host presence (burn now)", async () => {
    const { room } = await createRoom("T", "t");
    await heartbeatHost("p1", "Dana", "facilitator", room.slug);
    await endSession(room.slug);
    expect(await readHostPresence(room.slug)).toEqual([]);
  });
});

describe("server-role authority + role scoping (via /state route)", () => {
  function stateReq(slug: string, q: Record<string, string>) {
    const qs = new URLSearchParams(q).toString();
    return new NextRequest(`http://x/api/r/${slug}/state?${qs}`);
  }

  it("stores the SERVER-resolved tier, and presence reaches only the host view", async () => {
    const { room, passcodes } = await createRoom("T", "t");
    await setPhases(
      [{ id: "p1", moduleId: "capture", config: { label: "Ideas", prompt: "Go" } }],
      "S",
      room.slug,
    );
    // A cohost console polls with its passcode + presence id.
    const res = await stateGET(stateReq(room.slug, { code: passcodes.cohost, pid: "p1", pname: "Sam" }), {
      params: { room: room.slug },
    });
    const host = await res.json();
    // Heartbeat is fire-and-forget; give the microtask a tick, then read.
    await new Promise((r) => setTimeout(r, 5));
    const live = await readHostPresence(room.slug);
    expect(live).toHaveLength(1);
    expect(live[0].role).toBe("cohost"); // server-resolved, not client-claimed
    expect(live[0].name).toBe("Sam");
    // The host view carries presence...
    expect(Array.isArray(host.presence)).toBe(true);
    // ...but a participant poll never does.
    const pRes = await stateGET(stateReq(room.slug, { token: "tokX" }), {
      params: { room: room.slug },
    });
    const part = await pRes.json();
    expect(part.presence).toBeUndefined();
  });
});
