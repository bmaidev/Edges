import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { buildLink, surfaceFor, tokenKey } from "@/lib/magicLink";

describe("single facilitator portal links", () => {
  it("sends both facilitator roles to the canonical live portal", () => {
    expect(surfaceFor("facilitator")).toBe("/facilitate");
    expect(surfaceFor("cohost")).toBe("/facilitate");
  });

  it("keeps the access code in the fragment", () => {
    expect(
      buildLink("https://edges.test", "room-one", "facilitator", "secret code"),
    ).toBe("https://edges.test/r/room-one/facilitate#k=secret%20code");
  });

  it("leaves participant and projector destinations unchanged", () => {
    expect(surfaceFor("join")).toBe("");
    expect(surfaceFor("projector")).toBe("/screen");
  });

  it("keeps projector access from replacing facilitator access in the same tab", () => {
    expect(tokenKey("room-one")).toBe("edges:k:room-one");
    expect(tokenKey("room-one", "projector")).toBe(
      "edges:k:projector:room-one",
    );
  });

  it("keeps legacy and canonical routes on the same live-first portal", () => {
    for (const file of [
      "app/r/[room]/host/page.tsx",
      "app/r/[room]/facilitate/page.tsx",
    ]) {
      expect(fs.readFileSync(file, "utf8")).toContain('initialSurface="live"');
    }
  });

  it("does not hide a phase move behind a second takeover tap", () => {
    const source = fs.readFileSync("components/HostConsole.tsx", "utf8");
    expect(source).not.toContain("tap again to take over");
    expect(source).not.toContain("someoneElseDriving && !armed");
    expect(source).toContain("claimDriverId: me.presenceId");
  });

  it("publishing the participant recap closes the room lifecycle too", () => {
    const source = fs.readFileSync("components/TakeawayReview.tsx", "utf8");
    expect(source).toContain("alsoArchive: true");
  });
});
