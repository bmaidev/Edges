// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  clearParticipantSession,
  getExpiring,
  setExpiring,
} from "@/lib/browser-storage";

// Node 25 exposes an incomplete `localStorage` global unless a backing file is
// configured. Use a small standards-shaped in-memory implementation here.
const values = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  } satisfies Storage,
});

beforeEach(() => localStorage.clear());

describe("expiring participant browser storage", () => {
  it("returns a live value and erases it after expiry", () => {
    setExpiring("draft", "private", 100, 1_000);
    expect(getExpiring<string>("draft", 1_099)).toBe("private");
    expect(getExpiring<string>("draft", 1_100)).toBeNull();
    expect(localStorage.getItem("draft")).toBeNull();
  });

  it("drops legacy unbounded localStorage values", () => {
    localStorage.setItem("legacy", "private forever");
    expect(getExpiring("legacy")).toBeNull();
    expect(localStorage.getItem("legacy")).toBeNull();
  });

  it("clears room identity, queue, and participant drafts on End", () => {
    setExpiring("edges_handle:/api/r/room", "Ada");
    setExpiring("edges_token:/api/r/room", "tok");
    setExpiring("edges_queue:/api/r/room", [{ body: "raw" }]);
    setExpiring("edges_draft:tok:p1", "raw draft");
    setExpiring("edges_draft:other:p1", "leave another session alone");

    clearParticipantSession("/api/r/room", "tok");
    expect(localStorage.getItem("edges_handle:/api/r/room")).toBeNull();
    expect(localStorage.getItem("edges_token:/api/r/room")).toBeNull();
    expect(localStorage.getItem("edges_queue:/api/r/room")).toBeNull();
    expect(localStorage.getItem("edges_draft:tok:p1")).toBeNull();
    expect(localStorage.getItem("edges_draft:other:p1")).not.toBeNull();
  });
});
