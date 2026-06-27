// B4 — the portable design "envelope": encode a session design (DESIGN ONLY —
// prompts/timings, never participant material or passcodes) as a compact,
// versioned, checksummed code a facilitator can copy out (`.edges.json`) and
// someone else can import.
//
// Two layers of trust:
//  1. THIS module — pure, structural: base64url framing + a version gate + a
//     checksum (integrity, catches truncation/edits/corruption) + hard caps. No
//     store, no registry, no crypto — so it's trivially unit-tested and runs
//     anywhere. The checksum is NOT a security control.
//  2. The SECURITY control is validatePhases() (userTemplates), run by the import
//     ROUTE after decode: every phase is re-validated against its module's zod
//     schema and rebuilt as exactly {id, moduleId, config} — so a hostile payload
//     can never inject keys or unknown modules even if it has a valid checksum.

export const SHARE_VERSION = 1;
export const SHARE_MAX_PHASES = 60; // mirrors validatePhases' MAX_PHASES

export interface ShareMeta {
  description?: string;
  tag?: string;
  origin?: string; // free-text provenance, e.g. a room name or author
}

export interface SharePayload {
  v: number;
  name: string;
  phases: { id: string; moduleId: string; config: Record<string, unknown> }[];
  meta?: ShareMeta;
}

// djb2 over the canonical JSON — a fast, dependency-free integrity check (detects
// truncation / hand-editing / corruption). Deterministic and stable across runtimes.
export function checksum(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function b64urlEncode(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}
function b64urlDecode(s: string): string {
  return Buffer.from(s, "base64url").toString("utf8");
}

// Encode a design for sharing. `phases` should already be the clean
// {id, moduleId, config} shape (the caller holds validated phases).
export function encodeDesign(input: {
  name: string;
  phases: SharePayload["phases"];
  meta?: ShareMeta;
}): string {
  const body: SharePayload = {
    v: SHARE_VERSION,
    name: input.name.slice(0, 80),
    phases: input.phases,
    ...(input.meta ? { meta: input.meta } : {}),
  };
  const sum = checksum(JSON.stringify(body));
  return b64urlEncode(JSON.stringify({ ...body, sum }));
}

export type DecodeResult =
  | { ok: true; name: string; phases: SharePayload["phases"]; meta?: ShareMeta }
  | { ok: false; error: string };

// Decode + structurally vet a shared code. Does NOT run the zod re-validation —
// that's the import route's job (it needs the module registry). Returns raw phases
// for the route to validate.
export function decodeDesign(encoded: string): DecodeResult {
  const trimmed = (encoded ?? "").trim();
  if (!trimmed) return { ok: false, error: "Paste a design code first." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(b64urlDecode(trimmed));
  } catch {
    return { ok: false, error: "This doesn't look like a valid Edges design code." };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "This design code is malformed." };
  }
  const obj = parsed as Record<string, unknown> & { sum?: unknown };

  if (obj.v !== SHARE_VERSION) {
    return {
      ok: false,
      error: `This code is from a different version of Edges (v${String(obj.v)}).`,
    };
  }

  // Integrity: re-checksum the body (everything but `sum`) and compare.
  const { sum, ...body } = obj;
  if (typeof sum !== "string" || checksum(JSON.stringify(body)) !== sum) {
    return { ok: false, error: "This design code looks corrupted or edited." };
  }

  if (!Array.isArray(obj.phases) || obj.phases.length === 0) {
    return { ok: false, error: "This design has no phases." };
  }
  if (obj.phases.length > SHARE_MAX_PHASES) {
    return { ok: false, error: `This design has too many phases (max ${SHARE_MAX_PHASES}).` };
  }

  const name =
    typeof obj.name === "string" && obj.name.trim()
      ? obj.name.trim().slice(0, 80)
      : "Imported design";
  const meta =
    obj.meta && typeof obj.meta === "object"
      ? (obj.meta as ShareMeta)
      : undefined;

  return { ok: true, name, phases: obj.phases as SharePayload["phases"], meta };
}
