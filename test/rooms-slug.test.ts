import { describe, expect, it } from "vitest";
import { normalizeSlug, validateSlug } from "@/lib/slug";
import {
  createRoom,
  getRoom,
  slugAvailable,
  SlugError,
  SlugTakenError,
  updateRoom,
} from "@/lib/rooms";

// A4 — memorable room slugs. A slug is the room's primary key, so it's chosen
// ONCE (validated + atomically claimed) and never renamed; the display name is
// freely editable. These guard the validation, the TOCTOU-safe claim, and that
// editing a name leaves passcodes/links intact.

describe("normalizeSlug", () => {
  it("canonicalises arbitrary text", () => {
    expect(normalizeSlug("Strategy Offsite!")).toBe("strategy-offsite");
    expect(normalizeSlug("  Team   Sync  ")).toBe("team-sync");
    expect(normalizeSlug("Q3 — Planning")).toBe("q3-planning");
    expect(normalizeSlug("café déjà")).toBe("caf-d-j"); // unicode stripped
    expect(normalizeSlug("!!!")).toBe(""); // nothing usable
  });
  it("clamps to 32 chars with no trailing hyphen", () => {
    const s = normalizeSlug("a".repeat(40));
    expect(s.length).toBe(32);
    expect(s.endsWith("-")).toBe(false);
  });
});

describe("validateSlug", () => {
  it("flags empty / too short / reserved", () => {
    expect(validateSlug("").reason).toBe("empty");
    expect(validateSlug("ab").reason).toBe("too-short");
    expect(validateSlug("admin").reason).toBe("reserved");
    expect(validateSlug("help").reason).toBe("reserved");
  });
  it("accepts a good slug", () => {
    expect(validateSlug("team-sync").ok).toBe(true);
    expect(validateSlug("q3-planning-2026").ok).toBe(true);
  });
});

describe("createRoom with a chosen slug", () => {
  it("claims the exact slug", async () => {
    const { room } = await createRoom("Team Sync", "Topic", null, "team-sync");
    expect(room.slug).toBe("team-sync");
    expect(await getRoom("team-sync")).not.toBeNull();
  });

  it("normalises a messy chosen slug", async () => {
    const { room } = await createRoom("X", "t", null, "My  Cool  Room");
    expect(room.slug).toBe("my-cool-room");
  });

  it("rejects an invalid/reserved chosen slug with a typed reason", async () => {
    await expect(createRoom("X", "t", null, "admin")).rejects.toMatchObject({
      name: "SlugError",
      reason: "reserved",
    });
    await expect(createRoom("X", "t", null, "ab")).rejects.toBeInstanceOf(SlugError);
  });

  it("a blank chosen slug falls back to a random word-xxxx slug", async () => {
    const { room } = await createRoom("X", "t", null, "");
    expect(room.slug).toMatch(/^[a-z]+-[0-9a-f]{4}$/);
  });

  it("two concurrent creates of the same slug: exactly one wins, the other gets a suggestion", async () => {
    const results = await Promise.allSettled([
      createRoom("A", "t", null, "dup-room"),
      createRoom("B", "t", null, "dup-room"),
    ]);
    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r) => r.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    const err = (lost[0] as PromiseRejectedResult).reason;
    expect(err).toBeInstanceOf(SlugTakenError);
    expect(err.suggestion).toBe("dup-room-2");
  });
});

describe("slugAvailable", () => {
  it("covers free / taken / invalid / reserved", async () => {
    expect(await slugAvailable("totally-free-xyz")).toMatchObject({ available: true });
    await createRoom("X", "t", null, "now-taken");
    const taken = await slugAvailable("now-taken");
    expect(taken.available).toBe(false);
    expect(taken.suggestion).toBe("now-taken-2");
    expect((await slugAvailable("ab")).reason).toBe("too-short");
    expect((await slugAvailable("api")).reason).toBe("reserved");
  });
});

describe("editing a room name leaves the slug + passcodes intact", () => {
  it("renames the display name only", async () => {
    const { room } = await createRoom("Old Name", "t", null, "rename-me");
    const before = await getRoom("rename-me");
    const updated = await updateRoom("rename-me", { name: "New Name" });
    expect(updated?.name).toBe("New Name");
    expect(updated?.slug).toBe("rename-me"); // slug untouched (links still resolve)
    expect(updated?.passcodeHashes).toEqual(before?.passcodeHashes);
    expect(updated?.createdAt).toBe(before?.createdAt);
  });
});
