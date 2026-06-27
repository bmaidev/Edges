import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/admin/analytics/route";
import {
  captureSessionMetrics,
  clearSessionMetrics,
  createRoom,
} from "@/lib/rooms";
import { setPhases } from "@/lib/store";
import type { PhaseInstance } from "@/lib/types";

// F4 — the admin analytics route: metrics summary, export, clear; super-admin only.

beforeAll(() => {
  process.env.ADMIN_PASSCODE = "test-super-admin-analytics";
});
const ADMIN = "test-super-admin-analytics";
const url = (qs: string) => new NextRequest(`http://x/api/admin/analytics${qs}`);

const PHASES: PhaseInstance[] = [
  { id: "p1", moduleId: "capture", config: { label: "Ideas", prompt: "Go" } },
];

describe("GET analytics", () => {
  it("requires the super-admin code", async () => {
    expect((await GET(url("?code=nope"))).status).toBe(403);
  });

  it("returns the de-identified method-engagement summary", async () => {
    await clearSessionMetrics();
    const { room } = await createRoom("AnalyticsRoom", "Topic");
    await setPhases(PHASES, "S", room.slug);
    await captureSessionMetrics(room.slug);

    const res = await GET(url(`?code=${ADMIN}`));
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.metrics).toBeTruthy();
    expect(typeof d.metrics.totalSessions).toBe("number");
    expect(Array.isArray(d.metrics.methods)).toBe(true);
  });

  it("exports CSV with the right content-type + filename", async () => {
    const res = await GET(url(`?code=${ADMIN}&export=csv`));
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("edges-metrics.csv");
    const body = await res.text();
    expect(body.split("\n")[0]).toContain("participantCount");
  });
});

describe("POST clear", () => {
  it("super-admin can clear; a bad code is forbidden", async () => {
    const { room } = await createRoom("ClearRoom", "Topic");
    await setPhases(PHASES, "S", room.slug);
    await captureSessionMetrics(room.slug);

    const bad = await POST(
      new NextRequest("http://x/api/admin/analytics?code=nope", {
        method: "POST",
        body: JSON.stringify({ action: "clear" }),
      }),
    );
    expect(bad.status).toBe(403);

    const ok = await POST(
      new NextRequest(`http://x/api/admin/analytics?code=${ADMIN}`, {
        method: "POST",
        body: JSON.stringify({ action: "clear" }),
      }),
    );
    expect(ok.status).toBe(200);
  });
});
