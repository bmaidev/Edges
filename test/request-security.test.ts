import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  rateLimitResponse,
  requestCode,
  requestParticipantToken,
} from "@/lib/request-security";

const legacySetting = process.env.EDGES_ALLOW_LEGACY_QUERY_CODES;

afterEach(() => {
  if (legacySetting == null) delete process.env.EDGES_ALLOW_LEGACY_QUERY_CODES;
  else process.env.EDGES_ALLOW_LEGACY_QUERY_CODES = legacySetting;
});

describe("request capabilities", () => {
  it("does not accept capability secrets from URLs by default", () => {
    delete process.env.EDGES_ALLOW_LEGACY_QUERY_CODES;
    const req = new NextRequest("https://edges.test/state?code=host-secret&token=participant-secret");
    expect(requestCode(req)).toBeNull();
    expect(requestParticipantToken(req)).toBeNull();
  });

  it("accepts host and participant capabilities from headers", () => {
    delete process.env.EDGES_ALLOW_LEGACY_QUERY_CODES;
    const req = new NextRequest("https://edges.test/state", {
      headers: {
        "X-Edges-Code": "host-secret",
        "X-Edges-Participant-Token": "participant-secret",
      },
    });
    expect(requestCode(req)).toBe("host-secret");
    expect(requestParticipantToken(req)).toBe("participant-secret");
  });

  it("returns a bounded 429 response after an atomic fixed-window limit", async () => {
    const req = new NextRequest("https://edges.test/state", {
      headers: { "x-forwarded-for": "203.0.113.4", "user-agent": "security-test" },
    });
    expect(await rateLimitResponse(req, "unit", { limit: 1, windowSeconds: 60 })).toBeNull();
    const blocked = await rateLimitResponse(req, "unit", { limit: 1, windowSeconds: 60 });
    expect(blocked?.status).toBe(429);
    expect(Number(blocked?.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
});
