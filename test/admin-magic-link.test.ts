// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  adminMagicLink,
  bootToken,
  clearToken,
  tokenKey,
} from "@/lib/magicLink";

// Phase B1 — the admin portal's bookmarkable magic link. The workspace/admin code
// rides the URL FRAGMENT (never the query → never logged), is read once and
// scrubbed from the address bar, and is remembered for a reload within the tab.

afterEach(() => {
  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
  window.history.replaceState(null, "", "/admin");
});

describe("adminMagicLink", () => {
  it("puts the code in the #fragment, url-encoded", () => {
    expect(adminMagicLink("https://edges.app", "wsa-abc123")).toBe(
      "https://edges.app/admin#k=wsa-abc123",
    );
    expect(adminMagicLink("https://x", "a b/c")).toBe("https://x/admin#k=a%20b%2Fc");
  });
});

describe("bootToken('admin') — fragment sign-in", () => {
  it("reads a #k= token, scrubs the fragment, and remembers it for a reload", () => {
    window.history.replaceState(null, "", "/admin#k=wsa-secret");
    expect(window.location.hash).toBe("#k=wsa-secret");

    const got = bootToken("admin");
    expect(got).toBe("wsa-secret");
    // the fragment is gone from the address bar (never re-leaked)
    expect(window.location.hash).toBe("");
    // remembered for this tab → a reload (no fragment) still resolves it
    expect(bootToken("admin")).toBe("wsa-secret");
    expect(sessionStorage.getItem(tokenKey("admin"))).toBe("wsa-secret");
  });

  it("returns null with no fragment and no remembered token", () => {
    expect(bootToken("admin")).toBeNull();
  });

  it("clearToken('admin') forgets the remembered token (log out)", () => {
    window.history.replaceState(null, "", "/admin#k=wsa-x");
    expect(bootToken("admin")).toBe("wsa-x");
    clearToken("admin");
    expect(bootToken("admin")).toBeNull();
  });
});
