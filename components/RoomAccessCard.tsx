"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui";
import { buildLink, type LinkRole } from "@/lib/magicLink";

type ShareRole = "facilitator" | "cohost" | "projector";

interface RowDef {
  role: LinkRole;
  label: string;
  purpose: string;
}

const ROWS: RowDef[] = [
  { role: "facilitator", label: "Facilitator", purpose: "You — run the whole room." },
  { role: "cohost", label: "Co-host", purpose: "A second pair of hands; can drive but not end or reconfigure." },
  { role: "projector", label: "Big screen", purpose: "The projector / TV — read-only." },
  { role: "join", label: "Join", purpose: "Participants scan or tap to walk in (no code)." },
];

// The Room access card (A2): four clearly-labelled links. The link IS the key —
// the raw code is the demoted fallback behind "Show code". Every code is
// optional, so a fully-legacy room (no retrievable plaintext) renders the
// "Regenerate to get a shareable link" state instead of crashing.
export function RoomAccessCard({
  slug,
  name,
  codes,
  onRegenerate,
}: {
  slug: string;
  name?: string;
  codes: { facilitator?: string; cohost?: string; projector?: string };
  onRegenerate?: (role: ShareRole) => void | Promise<void>;
}) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [showCode, setShowCode] = useState<string | null>(null);
  const [showQr, setShowQr] = useState<string | null>(null);
  const [pending, setPending] = useState<ShareRole | null>(null);

  useEffect(() => setOrigin(window.location.origin), []);

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600);
    } catch {
      /* clipboard blocked — the Show code / link text is still selectable */
    }
  }

  function messageFor(label: string, link: string): string {
    if (label === "Join")
      return `Join my workshop "${name ?? slug}": ${link}`;
    return `Your ${label} link for "${name ?? slug}" — tap to open, anyone with it can use it:\n${link}`;
  }

  async function regen(role: ShareRole) {
    if (!onRegenerate) return;
    setPending(role);
    try {
      await onRegenerate(role);
    } finally {
      setPending(null);
    }
  }

  const presentLinks = ROWS.filter(
    (r) => r.role === "join" || codes[r.role as ShareRole],
  ).map((r) => {
    const code = r.role === "join" ? undefined : codes[r.role as ShareRole];
    return `${r.label}: ${buildLink(origin, slug, r.role, code)}`;
  });

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Share the room</p>
        <button
          onClick={() => copy("all", presentLinks.join("\n"))}
          className="text-xs text-accent underline"
        >
          {copied === "all" ? "Copied all" : "Copy all"}
        </button>
      </div>

      {ROWS.map((row) => {
        const isJoin = row.role === "join";
        const code = isJoin ? undefined : codes[row.role as ShareRole];
        const hasLink = isJoin || Boolean(code);
        const link = buildLink(origin, slug, row.role, code);
        const k = row.role;
        return (
          <div key={row.role} className="rounded-lg border border-border bg-bg p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">{row.label}</span>
              {!isJoin && (
                <span className="text-[11px] uppercase tracking-wide text-muted">
                  {hasLink ? "link ready" : "no link yet"}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted">{row.purpose}</p>

            {hasLink ? (
              <>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button className="!px-3 !py-1 !text-xs" onClick={() => copy(k, link)}>
                    {copied === k ? "Copied" : "Copy link"}
                  </Button>
                  <button
                    onClick={() => copy(`${k}-msg`, messageFor(row.label, link))}
                    className="rounded-lg border border-border px-3 py-1 text-xs text-white/80 hover:border-accent"
                  >
                    {copied === `${k}-msg` ? "Copied" : "Copy message"}
                  </button>
                  <button
                    onClick={() => setShowQr(showQr === k ? null : k)}
                    className="rounded-lg border border-border px-3 py-1 text-xs text-white/80 hover:border-accent"
                  >
                    {showQr === k ? "Hide QR" : "QR"}
                  </button>
                  {!isJoin && (
                    <button
                      onClick={() => setShowCode(showCode === k ? null : k)}
                      className="text-xs text-muted underline decoration-dotted"
                    >
                      {showCode === k ? "Hide code" : "Show code"}
                    </button>
                  )}
                  {!isJoin && onRegenerate && (
                    <button
                      onClick={() => regen(row.role as ShareRole)}
                      disabled={pending === row.role}
                      className="text-xs text-[#ffb86b] underline disabled:opacity-50"
                    >
                      {pending === row.role ? "Regenerating…" : "Regenerate"}
                    </button>
                  )}
                </div>
                {showQr === k && origin && (
                  <div className="mt-3 inline-block rounded-lg bg-white p-2">
                    <QRCodeSVG value={link} size={120} />
                  </div>
                )}
                {showCode === k && code && (
                  <p className="mt-2 break-all font-mono text-xs text-muted">{code}</p>
                )}
              </>
            ) : (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-muted">No shareable link yet.</span>
                {onRegenerate && (
                  <Button
                    className="!px-3 !py-1 !text-xs"
                    onClick={() => regen(row.role as ShareRole)}
                    disabled={pending === row.role}
                  >
                    {pending === row.role ? "Generating…" : "Regenerate to get a link"}
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      })}

      <p className="text-[11px] leading-relaxed text-muted">
        Anyone with a link can do its job — share it like a calendar invite.
        Regenerate any link to lock the old one out (including anyone currently
        using it).
      </p>
    </div>
  );
}
