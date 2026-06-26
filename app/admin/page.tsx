"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui";
import { RoomAccessCard } from "@/components/RoomAccessCard";

interface RoomRow {
  slug: string;
  name: string;
  topic: string;
  status: string;
  createdAt: number;
}

export default function AdminPage() {
  return (
    <Suspense fallback={<div className="p-8 text-muted">Loading…</div>}>
      <Admin />
    </Suspense>
  );
}

function Admin() {
  const params = useSearchParams();
  const [code, setCode] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [authed, setAuthed] = useState(false);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const c = params.get("code");
    if (c) setCode(c);
  }, [params]);

  const load = useCallback(async (c: string) => {
    const res = await fetch(`/api/admin/rooms?code=${encodeURIComponent(c)}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      setAuthed(false);
      setErr("Wrong admin passcode.");
      return;
    }
    const data = await res.json();
    setRooms(data.rooms ?? []);
    setAuthed(true);
    setErr(null);
  }, []);

  useEffect(() => {
    if (code) load(code);
  }, [code, load]);

  if (!authed) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-8">
        <h1 className="text-xl font-semibold">Admin portal</h1>
        <p className="text-sm text-muted">Enter the admin passcode.</p>
        <input
          type="password"
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setCode(codeInput)}
          placeholder="Admin passcode"
          className="rounded-xl border border-border bg-surface px-4 py-3 focus:border-accent focus:outline-none"
        />
        <Button onClick={() => setCode(codeInput)}>Enter</Button>
        {err && <p className="text-sm text-[#ff8a8a]">{err}</p>}
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl p-6 lg:max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Rooms</h1>
        <a href="/help?doc=admin-guide" className="text-sm text-accent underline">
          📖 Guides
        </a>
      </div>
      <CreateRoom code={code} onCreated={() => load(code)} />
      <div className="mt-6 flex flex-col gap-3">
        {rooms.length === 0 ? (
          <p className="text-sm text-muted">No rooms yet. Create one above.</p>
        ) : (
          rooms.map((r) => <RoomCard key={r.slug} room={r} code={code} />)
        )}
      </div>
    </main>
  );
}

function CreateRoom({
  code,
  onCreated,
}: {
  code: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{
    slug: string;
    name: string;
    passcodes: { admin: string; facilitator: string; cohost: string; projector: string };
  } | null>(null);

  const [err, setErr] = useState<string | null>(null);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, topic, code }),
      });
      const data = await res.json();
      if (res.ok) {
        setCreated(data);
        setName("");
        setTopic("");
        onCreated();
      } else {
        setErr(data.error ?? "Couldn't create the room.");
      }
    } catch {
      setErr("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-4 flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
        New room
      </h2>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Room name (e.g. Cybernetics meetup)"
        className="rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
      />
      <input
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder="Topic (optional)"
        className="rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
      />
      <Button onClick={create} disabled={busy || !name.trim()}>
        {busy ? "Creating…" : "Create room"}
      </Button>
      {err && <p className="text-sm text-[#ff8a8a]">{err}</p>}

      {created && (
        <div className="mt-2 flex flex-col gap-2">
          <RoomAccessCard
            slug={created.slug}
            name={created.name}
            codes={created.passcodes}
          />
          <button
            className="self-start text-xs text-muted underline"
            onClick={() => setCreated(null)}
          >
            Done — close
          </button>
        </div>
      )}
    </section>
  );
}

const PALETTE_KEYS = ["bg", "surface", "accent", "muted", "border"] as const;
const PALETTE_DEFAULTS: Record<string, string> = {
  bg: "#0F1A35",
  surface: "#1A2247",
  accent: "#E8B14A",
  muted: "#A8ADE9",
  border: "#2A3454",
};
const PALETTE_LABELS: Record<string, string> = {
  bg: "Background",
  surface: "Cards",
  accent: "Highlight",
  muted: "Secondary text",
  border: "Lines",
};

function RoomCard({ room, code }: { room: RoomRow; code: string }) {
  const [panel, setPanel] = useState<"theme" | "report" | "access" | null>(null);
  const [palette, setPalette] = useState<Record<string, string>>(PALETTE_DEFAULTS);
  const [logoUrl, setLogoUrl] = useState("");
  const [headline, setHeadline] = useState("");
  const [tagline, setTagline] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [report, setReport] = useState<any>(null);
  // Existing rooms keep only passcode HASHES, so we can't show their links — a
  // facilitator regenerates a role to mint a fresh shareable link. The returned
  // plaintext is spliced straight in (authoritative-apply, no read-back).
  const [accessCodes, setAccessCodes] = useState<{
    facilitator?: string;
    cohost?: string;
    projector?: string;
  }>({});
  async function regenRole(role: "facilitator" | "cohost" | "projector") {
    const res = await fetch(`/api/admin/rooms/${room.slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, action: "regenerate", role }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok && d.code) setAccessCodes((c) => ({ ...c, [role]: d.code }));
  }

  async function uploadLogo(file: File) {
    setUploading(true);
    setUploadErr(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch(
        `/api/admin/upload?code=${encodeURIComponent(code)}`,
        { method: "POST", body: fd },
      );
      const d = await res.json();
      if (res.ok && d.url) setLogoUrl(d.url);
      else setUploadErr(d.error ?? "Upload failed.");
    } catch {
      setUploadErr("Upload failed — try again.");
    } finally {
      setUploading(false);
    }
  }

  async function openTheme() {
    setPanel(panel === "theme" ? null : "theme");
    const res = await fetch(
      `/api/admin/rooms/${room.slug}?code=${encodeURIComponent(code)}`,
      { cache: "no-store" },
    );
    const d = await res.json();
    const t = d.room?.theme ?? {};
    setPalette({ ...PALETTE_DEFAULTS, ...(t.palette ?? {}) });
    setLogoUrl(t.logoUrl ?? "");
    setHeadline(t.headline ?? "");
    setTagline(t.tagline ?? "");
  }
  async function saveTheme() {
    await fetch(`/api/admin/rooms/${room.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        theme: {
          palette,
          logoUrl: logoUrl.trim() || undefined,
          headline: headline.trim() || undefined,
          tagline: tagline.trim() || undefined,
        },
      }),
    });
    setPanel(null);
  }
  async function openReport() {
    setPanel(panel === "report" ? null : "report");
    const res = await fetch(
      `/api/admin/rooms/${room.slug}?code=${encodeURIComponent(code)}`,
      { cache: "no-store" },
    );
    const d = await res.json();
    setReport(d.archive);
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{room.name}</p>
          <p className="text-xs text-muted">
            /{room.slug} · {room.status}
          </p>
        </div>
        <div className="flex gap-3 text-xs text-accent underline">
          <a href={`/r/${room.slug}`} target="_blank" rel="noreferrer">join</a>
          <a href={`/r/${room.slug}/host`} target="_blank" rel="noreferrer">host</a>
          <a href={`/r/${room.slug}/build`} target="_blank" rel="noreferrer">build</a>
          <a href={`/r/${room.slug}/screen`} target="_blank" rel="noreferrer">screen</a>
          <a href={`/r/${room.slug}/qr`} target="_blank" rel="noreferrer">qr</a>
          <button onClick={() => setPanel(panel === "access" ? null : "access")}>access</button>
          <button onClick={openTheme}>theme</button>
          <button onClick={openReport}>report</button>
        </div>
      </div>

      {panel === "access" && (
        <div className="mt-3 border-t border-border pt-3">
          <RoomAccessCard
            slug={room.slug}
            name={room.name}
            codes={accessCodes}
            onRegenerate={regenRole}
          />
        </div>
      )}

      {panel === "theme" && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="flex flex-wrap gap-3">
            {PALETTE_KEYS.map((k) => (
              <label key={k} className="flex items-center gap-2 text-xs">
                <input
                  type="color"
                  value={palette[k]}
                  onChange={(e) => setPalette({ ...palette, [k]: e.target.value })}
                />
                {PALETTE_LABELS[k]}
              </label>
            ))}
          </div>
          {/* Live preview of the chosen palette. */}
          <div
            className="mt-3 rounded-lg border p-3 text-sm"
            style={{
              backgroundColor: palette.bg,
              borderColor: palette.border,
              color: "#fff",
            }}
          >
            <span style={{ color: palette.accent }}>{room.name}</span>{" "}
            <span style={{ color: palette.muted }}>— preview</span>
            <div
              className="mt-2 rounded p-2"
              style={{ backgroundColor: palette.surface }}
            >
              A card on the surface colour.
            </div>
          </div>
          {/* Join-screen branding: logo + surprise copy shown on the projector
              lobby and the /qr door page. */}
          <div className="mt-4 flex flex-col gap-2 border-t border-border pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Join-screen branding (projector lobby + QR page)
            </p>
            <div className="flex items-center gap-3">
              {logoUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={logoUrl}
                  alt="logo preview"
                  className="h-12 w-12 shrink-0 rounded-lg border border-border object-contain"
                />
              )}
              <div className="flex flex-1 flex-col gap-1">
                <input
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="Logo image URL (or upload below)"
                  className="rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
                />
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadLogo(f);
                    }}
                    className="text-xs file:mr-2 file:rounded file:border-0 file:bg-accent/20 file:px-2 file:py-1 file:text-accent"
                  />
                  {uploading && <span>Uploading…</span>}
                  {logoUrl && !uploading && <span className="text-accent">✓ set</span>}
                </label>
                {uploadErr && <span className="text-xs text-[#ff8a8a]">{uploadErr}</span>}
              </div>
            </div>
            <input
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="Big headline — e.g. “Welcome, beautiful nerds 🛸”"
              maxLength={80}
              className="rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
            <input
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Tagline / surprise line under the QR"
              maxLength={140}
              className="rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
            <a
              href={`/r/${room.slug}/qr`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-accent underline"
            >
              Preview the QR / lobby page →
            </a>
          </div>
          <div className="mt-3 flex gap-2">
            <Button onClick={saveTheme}>Save theme & branding</Button>
            <Button variant="ghost" onClick={() => setPalette({ ...PALETTE_DEFAULTS })}>
              Reset colours
            </Button>
          </div>
        </div>
      )}

      {panel === "report" && (
        <div className="mt-3 border-t border-border pt-3 text-sm">
          {!report ? (
            <p className="text-muted">No archive yet. Use “Archive” in the host console to snapshot a session.</p>
          ) : (
            <div className="space-y-3">
              <p className="text-muted">
                {report.sessionName} · {report.participantCount} joined ·{" "}
                {report.submissions.length} submissions
              </p>
              {report.report ? (
                <div className="space-y-3 rounded-lg border border-accent/40 bg-accent/5 p-3">
                  <p className="text-xs uppercase tracking-wide text-accent">
                    AI session report
                  </p>
                  {report.report.summary && (
                    <p className="leading-relaxed">{report.report.summary}</p>
                  )}
                  {report.report.themes?.length > 0 && (
                    <div>
                      <p className="font-medium">Themes</p>
                      <ul className="ml-4 list-disc">
                        {report.report.themes.map((t: any, i: number) => (
                          <li key={i}>
                            <span className="font-medium">{t.title}</span>
                            {t.detail ? ` — ${t.detail}` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {report.report.tensions?.length > 0 && (
                    <ReportList title="Tensions" items={report.report.tensions} />
                  )}
                  {report.report.decisions?.length > 0 && (
                    <ReportList title="Decisions" items={report.report.decisions} />
                  )}
                  {report.report.nextSteps?.length > 0 && (
                    <ReportList title="Next steps" items={report.report.nextSteps} />
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted">
                  No AI report (the AI key wasn’t set when this was archived).
                </p>
              )}
              {report.patterns.length > 0 && (
                <div>
                  <p className="font-medium">Patterns</p>
                  <ul className="ml-4 list-disc">
                    {report.patterns.map((p: any, i: number) => (
                      <li key={i}>{p.name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReportList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="font-medium">{title}</p>
      <ul className="ml-4 list-disc">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}
