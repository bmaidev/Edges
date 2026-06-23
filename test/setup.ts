import { afterEach, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";

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
