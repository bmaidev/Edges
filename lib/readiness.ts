export function readinessStatus(input: {
  production: boolean;
  configured: boolean;
  reachable: boolean;
}): { ok: boolean; status: number } {
  const ok = input.reachable && (!input.production || input.configured);
  return { ok, status: ok ? 200 : 503 };
}
