// Phase B2 — self-service workspace signup policy. An operator chooses how open
// the instance is via env, with a SAFE DEFAULT (closed). Kept in one place so the
// policy is trivially testable and the route stays thin.
//
//   SIGNUP_OPEN === "true"  → fully open (anyone can create a workspace, no code)
//   else SIGNUP_CODE set    → gated by a shared community code (the request must
//                             carry the matching code)
//   else (neither)          → closed (super-admin-only, exactly Phase A)

import { sha256, safeEqualHex } from "./rooms";

export type SignupPolicy = "open" | "code" | "closed";

export function signupPolicy(): SignupPolicy {
  if (process.env.SIGNUP_OPEN === "true") return "open";
  if ((process.env.SIGNUP_CODE ?? "").length > 0) return "code";
  return "closed";
}

// Whether a signup is permitted given the request's (optional) community code.
// The code compare is constant-time (hash both, compare the hex), so a wrong code
// can't be timing-probed.
export function signupAllowed(code?: string | null): boolean {
  const policy = signupPolicy();
  if (policy === "open") return true;
  if (policy === "closed") return false;
  const expected = process.env.SIGNUP_CODE ?? "";
  if (!code) return false;
  return safeEqualHex(sha256(code), sha256(expected));
}
