"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { normalizeSlug } from "@/lib/slug";
import { Button } from "@/components/ui";
import { RoomAccessCard } from "@/components/RoomAccessCard";
import { CreateWorkshop } from "@/components/wizard/CreateWorkshop";
import {
  EMPTY_THEME,
  ThemePanel,
  themeForPatch,
  type ThemeDraft,
} from "@/components/admin/ThemePanel";
import { JoinScreenPreview } from "@/components/admin/JoinScreenPreview";
import { TourCoach } from "@/components/TourCoach";

interface RoomRow {
  slug: string;
  name: string;
  topic: string;
  status: string;
  createdAt: number;
  isSample?: boolean;
}

// Inlined (not imported from lib/sample) so no server-only code — node:crypto,
// @vercel/kv — is dragged into the admin client bundle.
const SAMPLE_SLUG = "sample-demo";

// Seed/reset the demo and open its surfaces. openHost always re-seeds (the only
// way to obtain a usable facilitator code — rooms persist hashes only), so the
// admin lands in a live-looking console with zero extra passcode entry.
function useSampleActions(code: string) {
  const [busy, setBusy] = useState<null | "host" | "screen" | "reset">(null);
  const [err, setErr] = useState<string | null>(null);

  async function post(): Promise<string | null> {
    const res = await fetch("/api/admin/sample", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(d.error ?? "Couldn't prepare the demo. Try again.");
      return null;
    }
    return (d.facilitatorCode as string) ?? null;
  }

  async function openHost() {
    setBusy("host");
    setErr(null);
    const fc = await post();
    setBusy(null);
    if (fc)
      window.open(
        `/r/${SAMPLE_SLUG}/host?tour=1&code=${encodeURIComponent(fc)}`,
        "_blank",
        "noreferrer",
      );
  }

  async function openScreen() {
    setBusy("screen");
    setErr(null);
    // Only seed if missing/stale, so we don't rotate the code under an open host.
    const st = await fetch(
      `/api/admin/sample?code=${encodeURIComponent(code)}`,
      { cache: "no-store" },
    )
      .then((r) => r.json())
      .catch(() => ({ exists: false, stale: true }));
    if (!st.exists || st.stale) await post();
    setBusy(null);
    window.open(`/r/${SAMPLE_SLUG}/screen?tour=1`, "_blank", "noreferrer");
  }

  async function reset() {
    setBusy("reset");
    setErr(null);
    await post();
    setBusy(null);
  }

  return { busy, err, openHost, openScreen, reset };
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
  const [showWizard, setShowWizard] = useState(false);
  // Tour: explicit-start only (calm ethos). `tourSeen` is the durable per-admin
  // flag that suppresses the first-run nudge across devices once toured.
  const [tourSeen, setTourSeen] = useState(true); // assume seen until told otherwise
  const [showTour, setShowTour] = useState(false);
  const [tourKey, setTourKey] = useState(0);

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
    // Best-effort: has this admin already toured? (suppresses the first-run nudge)
    fetch(`/api/admin/tour-seen?code=${encodeURIComponent(c)}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => setTourSeen(Boolean(d.seen)))
      .catch(() => setTourSeen(false));
  }, []);

  const markTourSeen = useCallback(() => {
    setTourSeen(true);
    fetch("/api/admin/tour-seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }).catch(() => {});
  }, [code]);

  const startTour = useCallback(() => {
    try {
      localStorage.removeItem("edges_tour_done_admin");
      localStorage.removeItem("edges_tour_step_admin");
    } catch {
      /* ignore */
    }
    setTourKey((k) => k + 1);
    setShowTour(true);
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

  // The sample room is pinned separately; "zero real rooms" drives first-run.
  const realRooms = rooms.filter((r) => !r.isSample);

  if (showWizard) {
    return (
      <main className="mx-auto w-full max-w-2xl p-6">
        <button
          onClick={() => setShowWizard(false)}
          className="mb-4 text-sm text-muted underline"
        >
          ← All rooms
        </button>
        <CreateWorkshop
          code={code}
          onClose={() => {
            setShowWizard(false);
            load(code);
          }}
          onCreated={() => load(code)}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl p-6 lg:max-w-3xl">
      {showTour && (
        <TourCoach
          key={tourKey}
          surface="admin"
          onComplete={() => {
            setShowTour(false);
            markTourSeen();
          }}
        />
      )}
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Rooms</h1>
        <div className="flex items-center gap-4 text-sm">
          <button onClick={startTour} className="text-accent underline">
            {tourSeen ? "Replay tour" : "Take the tour"}
          </button>
          <a href="/help?doc=admin-guide" className="text-accent underline">
            📖 Guides
          </a>
        </div>
      </div>
      <div className="mt-4" data-tour-id="create-workshop">
        <Button onClick={() => setShowWizard(true)}>＋ Create a workshop</Button>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-muted">Quick create (advanced)</summary>
        <CreateRoom code={code} onCreated={() => load(code)} />
      </details>

      {realRooms.length === 0 && !tourSeen && (
        <FirstRunBanner onStartTour={startTour} onDismiss={markTourSeen} />
      )}

      <div className="mt-6 flex flex-col gap-3" data-tour-id="sample-card">
        <SampleCard code={code} />
        {realRooms.length === 0 ? (
          <p className="text-sm text-muted">
            No rooms of your own yet — create one above, or poke the demo first.
          </p>
        ) : (
          realRooms.map((r) => (
            <RoomCard key={r.slug} room={r} code={code} onChanged={() => load(code)} />
          ))
        )}
      </div>
    </main>
  );
}

// First-run nudge (zero real rooms, not yet toured). Auto-offers but never
// auto-starts — the calm ethos. Skipping marks the durable seen flag so it
// doesn't re-nag.
function FirstRunBanner({
  onStartTour,
  onDismiss,
}: {
  onStartTour: () => void;
  onDismiss: () => void;
}) {
  return (
    <section className="mt-5 rounded-xl border border-accent/40 bg-accent/5 p-4">
      <p className="font-medium">New here?</p>
      <p className="mt-1 text-sm text-muted">
        Take the 5-minute tour — we&apos;ll point you at a safe demo room you
        can&apos;t break: seven fake participants, real messy ideas, a live
        timer. Press Advance, inject a slide, end the session and watch it vanish.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button onClick={onStartTour}>Start tour</Button>
        <button onClick={onDismiss} className="text-sm text-muted underline">
          Skip, I&apos;ll explore
        </button>
      </div>
    </section>
  );
}

// Pinned demo card — always at the top of the list, visually distinct.
function SampleCard({ code }: { code: string }) {
  const { busy, err, openHost, openScreen, reset } = useSampleActions(code);
  return (
    <div className="rounded-xl border border-dashed border-accent/60 bg-accent/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 font-medium">
            <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
              Demo
            </span>
            Sample workshop
          </p>
          <p className="text-xs text-muted">
            7 fake participants — safe to break
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-accent underline">
          <button onClick={openHost} disabled={busy !== null}>
            {busy === "host" ? "opening…" : "open host"}
          </button>
          <button onClick={openScreen} disabled={busy !== null}>
            {busy === "screen" ? "opening…" : "open screen"}
          </button>
          <button onClick={reset} disabled={busy !== null}>
            {busy === "reset" ? "resetting…" : "reset sample"}
          </button>
        </div>
      </div>
      {err && <p className="mt-2 text-xs text-[#ff8a8a]">{err}</p>}
    </div>
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
  // A4 — the memorable room address. Auto-fills from the name until the operator
  // edits it, then live-checks availability.
  const [slug, setSlug] = useState("");
  const [slugDirty, setSlugDirty] = useState(false);
  const [avail, setAvail] = useState<
    { available: boolean; slug: string; reason?: string; suggestion?: string } | null
  >(null);

  // Auto-derive the slug from the name while the operator hasn't touched it.
  useEffect(() => {
    if (!slugDirty) setSlug(normalizeSlug(name));
  }, [name, slugDirty]);

  // Debounced availability probe.
  useEffect(() => {
    if (!slug) {
      setAvail(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/admin/rooms/availability?code=${encodeURIComponent(code)}&slug=${encodeURIComponent(slug)}`,
        );
        if (res.ok) setAvail(await res.json());
      } catch {
        /* ignore — the create call is the real gate */
      }
    }, 350);
    return () => clearTimeout(t);
  }, [slug, code]);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, topic, slug: slug || undefined, code }),
      });
      const data = await res.json();
      if (res.ok) {
        setCreated(data);
        setName("");
        setTopic("");
        setSlug("");
        setSlugDirty(false);
        setAvail(null);
        onCreated();
      } else if (res.status === 409 && data.suggestion) {
        setErr(`That address is taken — try “${data.suggestion}”.`);
      } else {
        setErr(data.error ?? "Couldn't create the room.");
      }
    } catch {
      setErr("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  const slugBlocked = Boolean(slug) && avail !== null && !avail.available;

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
      {/* A4 — the memorable room address (the join URL). */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Room address</label>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm focus-within:border-accent">
          <span className="shrink-0 text-muted">/r/</span>
          <input
            value={slug}
            onChange={(e) => {
              setSlugDirty(true);
              setSlug(normalizeSlug(e.target.value));
            }}
            placeholder="team-sync"
            className="min-w-0 flex-1 bg-transparent focus:outline-none"
          />
        </div>
        {slug && avail && !avail.available && (
          <p className="text-xs text-[#ff8a8a]">
            {avail.reason
              ? "That address can't be used — try another."
              : "That address is taken."}
            {avail.suggestion && (
              <button
                type="button"
                className="ml-1 text-accent underline"
                onClick={() => {
                  setSlugDirty(true);
                  setSlug(avail.suggestion!);
                }}
              >
                use “{avail.suggestion}”
              </button>
            )}
          </p>
        )}
        {slug && avail?.available && (
          <p className="text-xs text-emerald-400">“{slug}” is available ✓</p>
        )}
      </div>
      <input
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder="Topic (optional)"
        className="rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
      />
      <Button onClick={create} disabled={busy || !name.trim() || slugBlocked}>
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

function RoomCard({
  room,
  code,
  onChanged,
}: {
  room: RoomRow;
  code: string;
  onChanged: () => void;
}) {
  // A1 — mark a draft room live, or permanently delete a room.
  async function markLive() {
    await fetch(`/api/admin/rooms/${room.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, status: "live" }),
    });
    onChanged();
  }
  async function del() {
    if (
      !window.confirm(
        `Delete "${room.name}"? This permanently removes the room, its data, and any saved report.`,
      )
    )
      return;
    await fetch(`/api/admin/rooms/${room.slug}?code=${encodeURIComponent(code)}`, {
      method: "DELETE",
    });
    onChanged();
  }
  const [panel, setPanel] = useState<"theme" | "report" | "access" | null>(null);
  const [theme, setTheme] = useState<ThemeDraft>(EMPTY_THEME);
  const [report, setReport] = useState<any>(null);
  // A4 — inline-edit the display name (never the slug — that's the room's key).
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(room.name);
  async function rename() {
    const next = nameDraft.trim();
    setEditingName(false);
    if (!next || next === room.name) return;
    await fetch(`/api/admin/rooms/${room.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, name: next }),
    });
    onChanged();
  }
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

  async function openTheme() {
    setPanel(panel === "theme" ? null : "theme");
    const res = await fetch(
      `/api/admin/rooms/${room.slug}?code=${encodeURIComponent(code)}`,
      { cache: "no-store" },
    );
    const d = await res.json();
    const t = d.room?.theme ?? {};
    setTheme({
      palette: { ...EMPTY_THEME.palette, ...(t.palette ?? {}) },
      logoUrl: t.logoUrl ?? "",
      headline: t.headline ?? "",
      tagline: t.tagline ?? "",
    });
  }
  async function saveTheme() {
    await fetch(`/api/admin/rooms/${room.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, theme: themeForPatch(theme) }),
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
          {editingName ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={rename}
              onKeyDown={(e) => {
                if (e.key === "Enter") rename();
                if (e.key === "Escape") {
                  setNameDraft(room.name);
                  setEditingName(false);
                }
              }}
              maxLength={120}
              className="rounded border border-border bg-bg px-2 py-0.5 text-sm font-medium focus:border-accent focus:outline-none"
            />
          ) : (
            <p
              className="cursor-pointer font-medium hover:underline"
              title="Click to rename"
              onClick={() => {
                setNameDraft(room.name);
                setEditingName(true);
              }}
            >
              {room.name}
            </p>
          )}
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
          {room.status === "draft" && (
            <button onClick={markLive} className="text-emerald-400">make live</button>
          )}
          <button onClick={del} className="text-[#ff8a8a]">delete</button>
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
        <div className="mt-3 grid gap-5 border-t border-border pt-3 md:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-3">
            <ThemePanel code={code} value={theme} onChange={setTheme} />
            <div>
              <Button onClick={saveTheme}>Save theme &amp; branding</Button>
            </div>
          </div>
          <div className="md:w-60">
            <JoinScreenPreview theme={theme} joinUrl={`/r/${room.slug}`} title={room.name} />
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
