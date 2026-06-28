// Phase E — a SECRET-FREE report of what this instance has configured, so an
// operator (self-host or managed) can verify their deploy. Only ever booleans +
// the (non-secret) signup MODE — never a key, token, or passcode value. Reuses
// the same env reads the libs use, so it can't drift from real behaviour.

import { secretsConfigured } from "./secrets";
import { signupPolicy, type SignupPolicy } from "./signup";

export interface InstanceConfig {
  // A super-admin passcode is set (without it, nobody can reach /admin).
  superAdmin: boolean;
  // The durable + session datastore (Vercel KV / Upstash) is wired.
  storage: { configured: boolean };
  ai: {
    // A global ANTHROPIC_API_KEY baseline (keeps AI available for keyless
    // workspaces); workspaces can still BYO their own key on top.
    baseline: boolean;
    // EDGES_SECRET_KEY is set, so workspaces CAN store an encrypted BYO key.
    byoEncryption: boolean;
  };
  // Vercel Blob is wired, so logo UPLOADS work (else: paste a logo URL).
  uploads: { blob: boolean };
  // How self-service workspace signup is gated.
  signup: SignupPolicy;
}

function envSet(...names: string[]): boolean {
  return names.some((n) => (process.env[n] ?? "").length > 0);
}

export function instanceConfig(): InstanceConfig {
  return {
    superAdmin: envSet("ADMIN_PASSCODE"),
    storage: {
      configured:
        envSet("KV_REST_API_URL", "UPSTASH_REDIS_REST_URL") &&
        envSet("KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_TOKEN"),
    },
    ai: {
      baseline: envSet("ANTHROPIC_API_KEY"),
      byoEncryption: secretsConfigured(),
    },
    uploads: { blob: envSet("BLOB_READ_WRITE_TOKEN") },
    signup: signupPolicy(),
  };
}
