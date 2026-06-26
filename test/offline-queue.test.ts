import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as actionPOST } from "@/app/api/r/[room]/action/route";
import { claimAction, listSubmissions, replaceState } from "@/lib/store";
import { createRoomWithSlug, freshPasscodes } from "@/lib/rooms";

// H1 offline queue — the load-bearing guarantee is server-side idempotency: a
// replayed send (same dedupeId) is acknowledged but applied only once.
const ADMIN = "test-super-admin-oq";
beforeAll(() => {
  process.env.ADMIN_PASSCODE = ADMIN;
});

async function seedCapture(slug: string) {
  const { hashes } = freshPasscodes();
  await createRoomWithSlug(slug, "Q", "t", { passcodeHashes: hashes });
  await replaceState(
    {
      mode: null,
      sessionName: "T",
      phases: [{ id: "p1", moduleId: "capture", config: { label: "Ideas", prompt: "Go" } }],
      phaseId: "p1",
      timerEndsAt: null,
      timerRemainingMs: null,
      readaroundIndex: 0,
      topic: "t",
      ended: false,
    },
    slug,
  );
}
function submitReq(slug: string, text: string, dedupeId?: string) {
  return new NextRequest(`http://x/api/r/${slug}/action`, {
    method: "POST",
    body: JSON.stringify({ type: "submit", payload: { text }, token: "a", handle: "A", dedupeId }),
  });
}

describe("claimAction", () => {
  it("is fresh once, then claimed", async () => {
    expect(await claimAction("oq-c", "id-1")).toBe(true);
    expect(await claimAction("oq-c", "id-1")).toBe(false); // replay
    expect(await claimAction("oq-c", "id-2")).toBe(true); // distinct
  });
});

describe("action route idempotency", () => {
  it("a replayed send (same dedupeId) applies exactly once", async () => {
    const slug = "oq-route";
    await seedCapture(slug);
    const r1 = await actionPOST(submitReq(slug, "my idea", "send-1"), { params: { room: slug } });
    expect(r1.status).toBe(200);
    // replay the exact same send (as the queue would on a flaky reconnect)
    const r2 = await actionPOST(submitReq(slug, "my idea", "send-1"), { params: { room: slug } });
    const d2 = await r2.json();
    expect(d2.ok).toBe(true);
    expect(d2.deduped).toBe(true); // acknowledged, not re-applied
    // exactly ONE submission landed
    const subs = await listSubmissions(slug);
    expect(subs.filter((s) => s.text === "my idea").length).toBe(1);
  });

  it("two genuinely different sends both apply", async () => {
    const slug = "oq-two";
    await seedCapture(slug);
    await actionPOST(submitReq(slug, "first", "a1"), { params: { room: slug } });
    await actionPOST(submitReq(slug, "second", "a2"), { params: { room: slug } });
    expect((await listSubmissions(slug)).length).toBe(2);
  });
});
