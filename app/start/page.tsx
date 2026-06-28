"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { PasscodeReveal } from "@/components/PasscodeReveal";

// Phase B2 — the public "create your workspace" page. An individual facilitator
// (or an org) self-onboards here; on success they get a bookmarkable sign-in link
// that IS their key. No account, no email — true to the "the link is the key"
// ethos. The operator controls openness via SIGNUP_OPEN / SIGNUP_CODE.

type Policy = "open" | "code" | "closed";
type Created = { name: string; adminCode: string; link: string };

export default function StartPage() {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    fetch("/api/signup", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setPolicy(d.policy))
      .catch(() => setPolicy("closed"));
  }, []);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), code: code.trim() || undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) setCreated(d);
      else setErr(d.error ?? "Couldn't create the workspace.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 p-8">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Create your workspace
        </h1>
        <p className="mt-2 text-sm text-muted">
          A workspace is your private home for running sessions — your rooms,
          designs and history, kept to you. It&apos;s free.
        </p>
      </div>

      {policy === null && <p className="text-sm text-muted">Loading…</p>}

      {policy === "closed" && !created && (
        <div className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
          Self-service signups are closed on this instance. Ask your host for an
          invite, or{" "}
          <a href="/admin" className="text-accent underline">
            sign in
          </a>{" "}
          if you already have a workspace link.
        </div>
      )}

      {policy && policy !== "closed" && !created && (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Workspace name</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              placeholder="e.g. Dana's workshops, or ANU Cybernetics"
              maxLength={80}
              className="rounded-xl border border-border bg-surface px-4 py-3 focus:border-accent focus:outline-none"
            />
          </label>
          {policy === "code" && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">Community code</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && create()}
                placeholder="The code your community shared"
                className="rounded-xl border border-border bg-surface px-4 py-3 focus:border-accent focus:outline-none"
              />
            </label>
          )}
          <Button onClick={create} disabled={busy || !name.trim()}>
            {busy ? "Creating…" : "Create workspace"}
          </Button>
          {err && <p className="text-sm text-[#ff8a8a]">{err}</p>}
        </div>
      )}

      {created && (
        <div className="flex flex-col gap-3 rounded-xl border border-emerald-400/40 bg-emerald-400/5 p-4">
          <p className="text-sm text-emerald-300">
            <strong>{created.name}</strong> is ready. The link below is your key —
            bookmark it. Anyone with it can administer this workspace, and we
            can&apos;t show it again.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href={created.link}>
              <Button>Open my workspace</Button>
            </a>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(created.link).then(() => {
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 2000);
                });
              }}
              className="rounded-lg border border-border px-3 py-2 text-xs text-muted hover:border-accent"
            >
              {linkCopied ? "Link copied ✓" : "Copy sign-in link"}
            </button>
          </div>
          <PasscodeReveal code={created.adminCode} label="raw code (fallback)" />
        </div>
      )}
    </main>
  );
}
