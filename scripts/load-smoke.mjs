#!/usr/bin/env node

// Content-free, read-only capacity smoke test for a disposable staging room.
// It exercises the same role-scoped /state path used by projector/host screens
// without browser automation or participant submissions.

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const baseUrl = option("base-url", process.env.EDGES_LOAD_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const room = option("room", process.env.EDGES_LOAD_ROOM || "");
const clients = Math.max(1, Number(option("clients", "50")) || 50);
const seconds = Math.max(5, Number(option("seconds", "60")) || 60);
const maxP95Ms = Math.max(1, Number(option("max-p95-ms", "1500")) || 1500);
const maxErrorRate = Math.max(0, Number(option("max-error-rate", "0.01")) || 0.01);
const facilitatorCode = process.env.EDGES_LOAD_CODE || "";

if (!room) {
  console.error(
    "Usage: npm run load:smoke -- --base-url https://staging.example --room disposable-room [--clients 100] [--seconds 60]",
  );
  process.exit(2);
}

const timings = [];
let errors = 0;
let requests = 0;
const stopAt = Date.now() + seconds * 1000;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function client(id) {
  await delay((id * 37) % 1000);
  while (Date.now() < stopAt) {
    const started = performance.now();
    try {
      const headers = { "User-Agent": `edges-capacity-smoke/${id}` };
      if (facilitatorCode) headers["X-Edges-Code"] = facilitatorCode;
      const suffix = facilitatorCode ? "" : "?role=projector";
      const response = await fetch(`${baseUrl}/api/r/${encodeURIComponent(room)}/state${suffix}`, {
        cache: "no-store",
        headers,
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) errors += 1;
      else await response.arrayBuffer();
    } catch {
      errors += 1;
    } finally {
      requests += 1;
      const elapsed = performance.now() - started;
      timings.push(elapsed);
      await delay(Math.max(0, 2000 - elapsed));
    }
  }
}

const readiness = await fetch(`${baseUrl}/api/health`, {
  cache: "no-store",
  signal: AbortSignal.timeout(5000),
}).catch(() => null);
if (!readiness?.ok) {
  console.error("Readiness failed; refusing to load an unhealthy deployment.");
  process.exit(1);
}

await Promise.all(Array.from({ length: clients }, (_, id) => client(id + 1)));
timings.sort((a, b) => a - b);
const percentile = (p) => timings[Math.min(timings.length - 1, Math.floor(timings.length * p))] ?? 0;
const errorRate = requests ? errors / requests : 1;

console.log(
  JSON.stringify(
    {
      clients,
      seconds,
      requests,
      errors,
      errorRate: Number(errorRate.toFixed(4)),
      latencyMs: {
        p50: Math.round(percentile(0.5)),
        p95: Math.round(percentile(0.95)),
        p99: Math.round(percentile(0.99)),
      },
      thresholds: { maxP95Ms, maxErrorRate },
    },
    null,
    2,
  ),
);

if (errorRate > maxErrorRate || percentile(0.95) > maxP95Ms) process.exit(1);
