// Magic-link helpers (A2). A "link" carries a room control credential in the URL
// FRAGMENT (`#k=…`) so the token never reaches a server log or the Referer
// header. The client reads it once on mount and scrubs it from the address bar.
// No server imports here — safe in the client bundle.

export type LinkRole = "facilitator" | "cohost" | "projector" | "join";

// Which surface each role's link opens. Join is the bare participant URL.
export function surfaceFor(role: LinkRole): string {
  if (role === "join") return "";
  if (role === "projector") return "/screen";
  return "/host"; // facilitator + cohost share the host console (role gates UI)
}

// Build a shareable link. Join carries no code; the others carry `#k=<code>`.
export function buildLink(
  origin: string,
  slug: string,
  role: LinkRole,
  code?: string,
): string {
  const base = `${origin}/r/${slug}${surfaceFor(role)}`;
  if (role === "join" || !code) return base;
  return `${base}#k=${encodeURIComponent(code)}`;
}

// Per-room sessionStorage key for a remembered token (tab-scoped; never
// localStorage; cleared on End/logout).
export function tokenKey(slug: string): string {
  return `edges:k:${slug}`;
}

// Phase B — a workspace's bookmarkable sign-in link for the admin portal. The
// admin/workspace code rides the URL FRAGMENT (never sent to a server, scrubbed
// on arrival), exactly like a room link — so it never leaks via the query string.
// `bootToken("admin")` / `clearToken("admin")` namespace the remembered token.
export function adminMagicLink(origin: string, code: string): string {
  return `${origin}/admin#k=${encodeURIComponent(code)}`;
}

// Client-only: pull the `#k=` token from the URL fragment, strip the fragment
// from the address bar without navigating, and return the token (or null). MUST
// run in the mount effect before anything that could leak the URL.
export function readAndScrubToken(): string | null {
  if (typeof window === "undefined") return null;
  const m = window.location.hash.match(/[#&]k=([^&]*)/);
  if (!m) return null;
  const token = decodeURIComponent(m[1] || "");
  const clean = window.location.pathname + window.location.search;
  window.history.replaceState(null, "", clean);
  return token || null;
}

// Resolve a remembered token: a fresh `#k=` wins; else the tab's sessionStorage.
// Persists a fresh token for reloads. Returns null when neither exists.
export function bootToken(slug: string): string | null {
  if (typeof window === "undefined") return null;
  const fromUrl = readAndScrubToken();
  if (fromUrl) {
    try {
      sessionStorage.setItem(tokenKey(slug), fromUrl);
    } catch {
      /* private mode / disabled storage — fine, just won't survive reload */
    }
    return fromUrl;
  }
  try {
    return sessionStorage.getItem(tokenKey(slug));
  } catch {
    return null;
  }
}

// Forget a remembered token (call on End-session / logout).
export function clearToken(slug: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(tokenKey(slug));
  } catch {
    /* ignore */
  }
}
