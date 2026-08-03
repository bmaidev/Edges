import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { consumeRateLimit } from "./store";

export const CODE_HEADER = "x-edges-code";
export const PARTICIPANT_TOKEN_HEADER = "x-edges-participant-token";

// Headers keep bearer capabilities out of CDN/proxy request URLs. A deliberately
// opt-in compatibility flag exists for operators migrating old bookmarked links;
// secure-by-default deployments never accept capability codes in a query string.
export function requestCode(req: NextRequest): string | null {
  const direct = req.headers.get(CODE_HEADER)?.trim();
  if (direct) return direct;
  const authorization = req.headers.get("authorization") ?? "";
  if (/^Bearer\s+/i.test(authorization)) return authorization.replace(/^Bearer\s+/i, "").trim();
  return process.env.EDGES_ALLOW_LEGACY_QUERY_CODES === "true"
    ? req.nextUrl.searchParams.get("code")
    : null;
}

export function requestParticipantToken(req: NextRequest): string | null {
  const direct = req.headers.get(PARTICIPANT_TOKEN_HEADER)?.trim();
  if (direct) return direct;
  return process.env.EDGES_ALLOW_LEGACY_QUERY_CODES === "true"
    ? req.nextUrl.searchParams.get("token")
    : null;
}

function fingerprint(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || req.headers.get("x-real-ip") || "unknown";
  const agent = (req.headers.get("user-agent") || "unknown").slice(0, 160);
  return createHash("sha256").update(`${address}|${agent}`).digest("hex").slice(0, 24);
}

export async function rateLimitResponse(
  req: NextRequest,
  scope: string,
  options: { limit: number; windowSeconds?: number },
): Promise<NextResponse | null> {
  const windowSeconds = options.windowSeconds ?? 60;
  const result = await consumeRateLimit(
    `${scope}:${fingerprint(req)}`,
    options.limit,
    windowSeconds,
  );
  if (result.allowed) return null;
  return NextResponse.json(
    { error: "Too many requests — wait a moment and try again." },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfter),
        "Cache-Control": "no-store",
      },
    },
  );
}
