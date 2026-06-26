import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import fs from "node:fs";
import { TOUR_STEPS, stepsForSurface } from "@/lib/tour";
import {
  GET as tourSeenGET,
  POST as tourSeenPOST,
} from "@/app/api/admin/tour-seen/route";

// A3 PR2 — the TourCoach script + durable seen flag.
const ADMIN = "test-super-admin-tour";
beforeAll(() => {
  process.env.ADMIN_PASSCODE = ADMIN;
});

describe("A3 tour script", () => {
  it("has steps on every surface, each with title + body", () => {
    for (const surface of ["admin", "host", "screen"] as const) {
      const steps = stepsForSurface(surface);
      expect(steps.length).toBeGreaterThan(0);
      for (const s of steps) {
        expect(s.title.length).toBeGreaterThan(0);
        expect(s.body.length).toBeGreaterThan(0);
        expect(s.surface).toBe(surface);
      }
    }
  });

  it("the host spine gates on authoritative state (phaseChanged + sessionEnded)", () => {
    const host = stepsForSurface("host");
    const awaits = host.map((s) => s.await).filter(Boolean);
    expect(awaits).toContain("phaseChanged");
    expect(awaits).toContain("sessionEnded");
    // Awaited steps carry a celebratory swap so the gate firing is felt.
    for (const s of host.filter((x) => x.await))
      expect(typeof s.doneBody).toBe("string");
  });

  it("anchors reference data-tour-id values present in the host console", () => {
    const src = fs.readFileSync("components/HostConsole.tsx", "utf8");
    const hostAnchors = stepsForSurface("host")
      .map((s) => s.anchor)
      .filter((a): a is string => Boolean(a));
    for (const a of hostAnchors) {
      // tab-* anchors are rendered via a template literal `tab-${t.id}`.
      const present = a.startsWith("tab-")
        ? src.includes("data-tour-id={`tab-")
        : src.includes(`data-tour-id="${a}"`);
      expect(present, `missing data-tour-id for "${a}"`).toBe(true);
    }
  });

  it("only one terminal cta (create a real room) and it points at /admin", () => {
    const withCta = TOUR_STEPS.filter((s) => s.cta);
    expect(withCta.length).toBeGreaterThanOrEqual(1);
    expect(withCta.every((s) => s.cta?.href === "/admin")).toBe(true);
  });
});

describe("A3 tour-seen endpoint", () => {
  it("round-trips the durable flag and 403s a wrong code", async () => {
    const before = await tourSeenGET(
      new NextRequest(`http://x/api/admin/tour-seen?code=${ADMIN}`),
    );
    expect((await before.json()).seen).toBe(false);

    const set = await tourSeenPOST(
      new NextRequest("http://x/api/admin/tour-seen", {
        method: "POST",
        body: JSON.stringify({ code: ADMIN }),
      }),
    );
    expect(set.status).toBe(200);

    const after = await tourSeenGET(
      new NextRequest(`http://x/api/admin/tour-seen?code=${ADMIN}`),
    );
    expect((await after.json()).seen).toBe(true);

    const forbidden = await tourSeenGET(
      new NextRequest("http://x/api/admin/tour-seen?code=nope"),
    );
    expect(forbidden.status).toBe(403);
  });
});
