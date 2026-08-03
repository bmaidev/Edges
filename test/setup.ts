import { afterEach, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";

// Route tests created before bearer capabilities moved to headers still cover
// the explicitly opt-in migration path. Dedicated request-security tests assert
// that production/default behavior rejects query-string capabilities.
process.env.EDGES_ALLOW_LEGACY_QUERY_CODES = "true";

// The store's dev/test backend pins all data to globalThis.__edgesMem (see
// lib/store.ts). Reset it around every test so cases are fully isolated and
// never bleed room/session/vote state into one another.
function resetMemStore() {
  const g = globalThis as unknown as { __edgesMem?: Map<string, unknown> };
  g.__edgesMem?.clear();
  g.__edgesMem = new Map();
}

beforeEach(resetMemStore);
afterEach(resetMemStore);
