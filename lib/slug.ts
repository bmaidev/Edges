// A4 — memorable room slugs. Pure helpers (no KV, no crypto) so slug rules are
// trivially testable and shared by the create flow + the availability check.
//
// IMPORTANT: a room's slug IS its primary key — every per-room KV key, passcode,
// and magic link is slug-scoped. So a slug is chosen ONCE at create time and
// never renamed (a rename would orphan all of a room's data and break its links).
// These helpers govern that one-time choice; the display *name* is freely editable.

// Top-level route names a room slug must never collide with, plus a small UX
// blocklist. `/r/<slug>/host` etc. are sub-paths, so only top-level names matter.
// A readonly array (not a Set) — `downlevelIteration` is off in this project.
export const RESERVED_SLUGS: readonly string[] = [
  "admin", "api", "r", "_next", "favicon.ico", "robots.txt", "sitemap.xml",
  "help", "login", "logout", "static", "public", "assets", "app", "www",
  "root", "null", "undefined", "new", "create", "edit", "delete", "settings",
  "about", "terms", "privacy", "security", "screen", "host", "join",
];

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.includes(slug);
}

// Canonicalise arbitrary text into a slug: lowercase ASCII, non-alphanumerics
// become single hyphens, no leading/trailing/double hyphens, max 32 chars.
export function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // any run of non-alnum → one hyphen
    .replace(/^-+|-+$/g, "") // trim hyphens
    .slice(0, 32)
    .replace(/-+$/g, ""); // re-trim if the clamp left a trailing hyphen
}

export type SlugReason = "empty" | "too-short" | "too-long" | "charset" | "reserved";

// Validate an ALREADY-normalised slug. Returns the first failing reason, or ok.
export function validateSlug(slug: string): { ok: boolean; reason?: SlugReason } {
  if (!slug) return { ok: false, reason: "empty" };
  if (slug.length < 3) return { ok: false, reason: "too-short" };
  if (slug.length > 32) return { ok: false, reason: "too-long" };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return { ok: false, reason: "charset" };
  if (isReservedSlug(slug)) return { ok: false, reason: "reserved" };
  return { ok: true };
}

// Human-friendly message for a validation reason.
export function slugReasonMessage(reason: SlugReason): string {
  switch (reason) {
    case "empty":
      return "Enter a name for the room address.";
    case "too-short":
      return "A room address needs at least 3 characters.";
    case "too-long":
      return "A room address can be at most 32 characters.";
    case "charset":
      return "Use lowercase letters, numbers, and hyphens.";
    case "reserved":
      return "That address is reserved — pick another.";
  }
}
