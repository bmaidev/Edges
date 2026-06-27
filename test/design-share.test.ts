import { describe, expect, it } from "vitest";
import {
  SHARE_VERSION,
  checksum,
  decodeDesign,
  encodeDesign,
} from "@/lib/design-share";

// B4 — the portable design envelope. Pure framing + integrity; the zod security
// re-validation is the import route's job (tested via userTemplates).

const PHASES = [
  { id: "p1", moduleId: "capture", config: { label: "Ideas", prompt: "Go" } },
  { id: "p2", moduleId: "dotvote", config: { label: "Vote", options: ["A", "B"] } },
];

describe("encode / decode round-trip", () => {
  it("round-trips name + phases + meta intact", () => {
    const code = encodeDesign({
      name: "My Flow",
      phases: PHASES,
      meta: { description: "a test", tag: "retro", origin: "Room X" },
    });
    const r = decodeDesign(code);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.name).toBe("My Flow");
      expect(r.phases).toEqual(PHASES);
      expect(r.meta).toEqual({ description: "a test", tag: "retro", origin: "Room X" });
    }
  });

  it("round-trips without meta", () => {
    const r = decodeDesign(encodeDesign({ name: "No meta", phases: PHASES }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.meta).toBeUndefined();
  });
});

describe("integrity + safety", () => {
  it("rejects a tampered payload (checksum mismatch)", () => {
    const code = encodeDesign({ name: "X", phases: PHASES });
    // Flip a char in the middle of the base64url to corrupt the body.
    const i = Math.floor(code.length / 2);
    const tampered = code.slice(0, i) + (code[i] === "A" ? "B" : "A") + code.slice(i + 1);
    const r = decodeDesign(tampered);
    expect(r.ok).toBe(false);
  });

  it("rejects a hand-edited body even with the original checksum re-attached", () => {
    // Decode, mutate phases, re-encode WITHOUT recomputing the checksum.
    const good = JSON.parse(
      Buffer.from(encodeDesign({ name: "X", phases: PHASES }), "base64url").toString("utf8"),
    );
    good.phases.push({ id: "evil", moduleId: "capture", config: {} }); // mutate, keep old sum
    const forged = Buffer.from(JSON.stringify(good), "utf8").toString("base64url");
    const r = decodeDesign(forged);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/corrupted or edited/);
  });

  it("rejects a different version", () => {
    const body = { v: SHARE_VERSION + 1, name: "X", phases: PHASES };
    const sum = checksum(JSON.stringify(body));
    const code = Buffer.from(JSON.stringify({ ...body, sum }), "utf8").toString("base64url");
    const r = decodeDesign(code);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/different version/);
  });

  it("rejects garbage / empty input gracefully (no throw)", () => {
    expect(decodeDesign("").ok).toBe(false);
    expect(decodeDesign("not base64!!!").ok).toBe(false);
    expect(decodeDesign("xxxx").ok).toBe(false);
  });

  it("rejects an empty or over-large phase list", () => {
    const empty = encodeDesign({ name: "X", phases: [] });
    expect(decodeDesign(empty).ok).toBe(false);
    const many = encodeDesign({
      name: "X",
      phases: Array.from({ length: 61 }, (_, i) => ({ id: `p${i}`, moduleId: "capture", config: {} })),
    });
    const r = decodeDesign(many);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/too many phases/);
  });
});
