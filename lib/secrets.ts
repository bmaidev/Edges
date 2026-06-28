// Phase D — symmetric encryption for secrets stored at rest in KV (a workspace's
// BYO Anthropic key). AES-256-GCM with a server master key from EDGES_SECRET_KEY,
// so a customer's API key is never readable from the datastore alone — only the
// server holding the master key can decrypt it to make the call.
//
// Fail-safe: if EDGES_SECRET_KEY is unset, secretsConfigured() is false and BYO
// key storage is refused (the global ANTHROPIC_API_KEY still works) — we never
// store a secret we can't protect.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export interface SealedSecret {
  ciphertext: string; // hex
  iv: string; // hex (12 bytes)
  tag: string; // hex (16-byte GCM auth tag)
}

export function secretsConfigured(): boolean {
  // Require a master key with real entropy. sha256 normalises any length ≥16 to a
  // 32-byte AES key, so the only bar is "set and not trivially short".
  return (process.env.EDGES_SECRET_KEY ?? "").length >= 16;
}

// 32-byte AES key derived from the master secret (accepts any sufficiently-long
// string — hex, base64, or a passphrase).
function masterKey(): Buffer {
  return createHash("sha256").update(process.env.EDGES_SECRET_KEY ?? "").digest();
}

export function encrypt(plaintext: string): SealedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("hex"),
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
  };
}

// Decrypt a sealed secret, or null if the master key is wrong / the blob was
// tampered with (GCM auth-tag mismatch throws → caught → null).
export function decrypt(sealed: SealedSecret): string | null {
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      masterKey(),
      Buffer.from(sealed.iv, "hex"),
    );
    decipher.setAuthTag(Buffer.from(sealed.tag, "hex"));
    const out = Buffer.concat([
      decipher.update(Buffer.from(sealed.ciphertext, "hex")),
      decipher.final(),
    ]);
    return out.toString("utf8");
  } catch {
    return null;
  }
}
