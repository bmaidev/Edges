"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { normalizeSlug } from "@/lib/slug";
import { groupRooms } from "@/lib/room-groups";
import { Button } from "@/components/ui";
import { RoomAccessCard } from "@/components/RoomAccessCard";
import { PasscodeReveal } from "@/components/PasscodeReveal";
import { adminMagicLink, bootToken, clearToken, tokenKey } from "@/lib/magicLink";
import { CreateWorkshop } from "@/components/wizard/CreateWorkshop";
import {
  EMPTY_THEME,
  ThemePanel,
  themeForPatch,
  type ThemeDraft,
} from "@/components/admin/ThemePanel";
import { JoinScreenPreview } from "@/components/admin/JoinScreenPreview";
import { AnalyticsPanel } from "@/components/admin/AnalyticsPanel";
import { ReportDocument } from "@/lib/report/ReportDocument";
import { reportToMarkdown } from "@/lib/report/markdown";
import { ActionItemsExport } from "@/components/ActionItemsExport";
import { TourCoach } from "@/components/TourCoach";

interface RoomRow {
  slug: string;
  name: string;
  topic: string;
  status: string;
  createdAt: number;
  isSample?: boolean;
  // A5 — design summary + last-run memory.
  blueprint?: { chips: string[]; phaseCount: number } | null;
  lastRun?: { endedAt: number; participantCount: number; submissionCount: number } | null;
  // C3 — who created it (a named member), for the shared rooms list.
  createdBy?: string | null;
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
  // A4 — which workspace (tenant) this code administers.
  const [context, setContext] = useState<{
    workspaceId: string;
    name: string;
    isSuperAdmin: boolean;
    role: "owner" | "member" | null;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  // F4 — Rooms vs cross-session Analytics.
  const [tab, setTab] = useState<"rooms" | "analytics">("rooms");
  // Tour: explicit-start only (calm ethos). `tourSeen` is the durable per-admin
  // flag that suppresses the first-run nudge across devices once toured.
  const [tourSeen, setTourSeen] = useState(true); // assume seen until told otherwise
  const [showTour, setShowTour] = useState(false);
  const [tourKey, setTourKey] = useState(0);

  useEffect(() => {
    // Phase B — prefer the bookmarkable magic link (#k= fragment, read once and
    // scrubbed from the address bar), then a remembered token from this tab, then
    // a legacy ?code= query for older links.
    const t = bootToken("admin") || params.get("code");
    if (t) setCode(t);
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
    setContext(data.context ?? null);
    setAuthed(true);
    setErr(null);
    // Phase B — remember the code for this tab so a reload stays signed in
    // (covers manual passcode entry; a #k= link is already remembered by bootToken).
    try {
      sessionStorage.setItem(tokenKey("admin"), c);
    } catch {
      /* private mode — fine, just won't survive a reload */
    }
    // Best-effort: has this admin already toured? (suppresses the first-run nudge)
    fetch(`/api/admin/tour-seen?code=${encodeURIComponent(c)}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => setTourSeen(Boolean(d.seen)))
      .catch(() => setTourSeen(false));
  }, []);

  const logout = useCallback(() => {
    clearToken("admin");
    setCode("");
    setCodeInput("");
    setAuthed(false);
    setContext(null);
    setRooms([]);
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
        <p className="text-center text-xs text-muted">
          No workspace yet?{" "}
          <a href="/start" className="text-accent underline">
            Create one
          </a>
        </p>
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
          <button onClick={logout} className="text-muted underline hover:text-white">
            Log out
          </button>
        </div>
      </div>

      {/* A4 — the active workspace (tenant) + super-admin workspace controls. */}
      {context && <WorkspaceBar code={code} context={context} />}

      {/* C2 — workspace members (owner-only: add/revoke named people). */}
      {context && (context.isSuperAdmin || context.role === "owner") && (
        <MembersPanel code={code} />
      )}

      {/* D3 — the workspace's BYO Anthropic key (owner-only). */}
      {context && (context.isSuperAdmin || context.role === "owner") && (
        <AiKeyPanel code={code} />
      )}

      {/* F4 — Rooms / Analytics tabs. */}
      <div className="mt-3 flex gap-1 border-b border-border text-sm">
        {(["rooms", "analytics"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-1.5 ${
              tab === t ? "border-accent text-accent" : "border-transparent text-muted hover:text-white"
            }`}
          >
            {t === "rooms" ? "Rooms" : "Analytics"}
          </button>
        ))}
      </div>

      {tab === "analytics" ? (
        <AnalyticsPanel code={code} />
      ) : (
        <>
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
              <MyWorkshops rooms={realRooms} code={code} onChanged={() => load(code)} />
            )}
          </div>
        </>
      )}
    </main>
  );
}

// A4 — the active workspace (tenant) line + super-admin workspace management.
// A workspace admin just sees which workspace they're in (their code already
// scopes everything); the super-admin can list workspaces and mint a new one,
// handing its admin code to an org — "the code is the key" to that workspace.
type WsContext = {
  workspaceId: string;
  name: string;
  isSuperAdmin: boolean;
  role: "owner" | "member" | null;
};
type WsMeta = { id: string; name: string; createdAt: number };
type MemberMeta = { id: string; name: string; role: "owner" | "member"; createdAt: number };

function WorkspaceBar({ code, context }: { code: string; context: WsContext }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<WsMeta[] | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ name: string; adminCode: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);
  // D4 — erase-this-workspace (owner/super, never the default), typed-name confirm.
  const [confirming, setConfirming] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const canDelete =
    (context.isSuperAdmin || context.role === "owner") &&
    context.workspaceId !== "default";
  async function eraseWorkspace() {
    await fetch("/api/admin/workspaces", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, workspaceId: context.workspaceId }),
    });
    // The workspace (and this code) are gone — drop the remembered token + reset.
    clearToken("admin");
    window.location.href = "/admin";
  }

  async function openPanel() {
    const next = !open;
    setOpen(next);
    if (next && list === null) {
      const res = await fetch(`/api/admin/workspaces?code=${encodeURIComponent(code)}`, {
        cache: "no-store",
      });
      if (res.ok) setList((await res.json()).workspaces ?? []);
    }
  }

  async function create() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setCreated({ name: d.name, adminCode: d.adminCode });
        setNewName("");
        setList((prev) => [...(prev ?? []), { id: d.id, name: d.name, createdAt: Date.now() }]);
      } else {
        setErr(d.error ?? "Couldn't create the workspace.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted">
          Workspace: <span className="font-medium text-white/90">{context.name}</span>
          {context.isSuperAdmin && (
            <span className="ml-2 rounded bg-accent/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-accent">
              super-admin
            </span>
          )}
        </p>
        <div className="flex items-center gap-3">
          {canDelete && (
            <button
              onClick={() => setConfirming((v) => !v)}
              className="text-[#ff8a8a] underline"
            >
              Delete workspace
            </button>
          )}
          {context.isSuperAdmin && (
            <button onClick={openPanel} className="text-accent underline">
              {open ? "Close" : "Manage workspaces"}
            </button>
          )}
        </div>
      </div>

      {/* D4 — danger zone: typed-name confirm before erasing everything. */}
      {canDelete && confirming && (
        <div className="mt-3 flex flex-col gap-2 border-t border-[#ff8a8a]/30 pt-3">
          <p className="text-xs text-[#ff8a8a]">
            This permanently erases <strong>{context.name}</strong> and ALL its
            rooms, reports, analytics, designs and members. It can&apos;t be undone.
            Type the workspace name to confirm.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={context.name}
              className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
            <button
              onClick={eraseWorkspace}
              disabled={confirmName.trim() !== context.name}
              className="rounded-lg border border-[#ff8a8a] px-3 py-2 text-xs text-[#ff8a8a] hover:bg-[#ff8a8a]/10 disabled:opacity-40"
            >
              Erase everything
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="text-xs text-muted underline"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {context.isSuperAdmin && open && (
        <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Workspaces</p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {(list ?? []).map((w) => (
                <li key={w.id} className="text-sm">
                  {w.name}{" "}
                  <span className="text-xs text-muted">/{w.id}</span>
                </li>
              ))}
              {list && list.length === 0 && (
                <li className="text-sm text-muted">Just the default so far.</li>
              )}
            </ul>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-1 flex-col gap-1 text-xs">
              <span className="text-muted">New workspace (e.g. an org or team)</span>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && create()}
                placeholder="ANU School of Applied Cybernetics"
                maxLength={80}
                className="rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
            </label>
            <Button onClick={create} disabled={busy || !newName.trim()}>
              {busy ? "Creating…" : "Create"}
            </Button>
          </div>
          {err && <p className="text-xs text-[#ff8a8a]">{err}</p>}

          {created && (
            <div className="rounded-lg border border-emerald-400/40 bg-emerald-400/5 p-3">
              <p className="text-sm text-emerald-300">
                Created <strong>{created.name}</strong> — shown once. The link below
                is its key: anyone with it administers this workspace. Send it to the
                workspace&apos;s facilitators to bookmark (you can&apos;t see it again).
              </p>
              {/* B1 — the bookmarkable magic link (code in the #fragment, never the
                  query) is the primary hand-off; the raw code is the fallback. */}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard
                      ?.writeText(adminMagicLink(origin, created.adminCode))
                      .then(() => {
                        setLinkCopied(true);
                        setTimeout(() => setLinkCopied(false), 2000);
                      });
                  }}
                  className="rounded-lg border border-accent px-3 py-1.5 text-xs text-accent hover:bg-accent/10"
                >
                  {linkCopied ? "Sign-in link copied ✓" : "Copy sign-in link"}
                </button>
                <PasscodeReveal code={created.adminCode} label="raw code" />
              </div>
              <button
                className="mt-2 text-xs text-muted underline"
                onClick={() => setCreated(null)}
              >
                Done
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// C2 — the workspace's members. Owner-only: list the named people, add one (which
// mints their bookmarkable sign-in link, shown once), and revoke. Rooms are shared
// across the workspace, so this is about WHO can act + attribution, not silos.
function MembersPanel({ code }: { code: string }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<MemberMeta[] | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState<"owner" | "member">("member");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ name: string; link: string; code: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/admin/members?code=${encodeURIComponent(code)}`, {
      cache: "no-store",
    });
    if (res.ok) setList((await res.json()).members ?? []);
  }, [code]);

  async function openPanel() {
    const next = !open;
    setOpen(next);
    if (next && list === null) await refresh();
  }

  async function add() {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name: n, role }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setCreated({ name: d.member.name, link: d.link, code: d.code });
        setName("");
        await refresh();
      } else {
        setErr(d.error ?? "Couldn't add the member.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function revoke(memberId: string, who: string) {
    if (!window.confirm(`Revoke ${who}? Their sign-in link stops working.`)) return;
    await fetch("/api/admin/members", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, memberId }),
    });
    await refresh();
  }

  return (
    <div className="mt-3 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted">
          Members{list ? ` · ${list.length}` : ""}
        </p>
        <button onClick={openPanel} className="text-accent underline">
          {open ? "Close" : "Manage members"}
        </button>
      </div>

      {open && (
        <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
          <ul className="flex flex-col gap-1">
            {(list ?? []).map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2">
                <span>
                  {m.name}{" "}
                  <span className="rounded bg-bg px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                    {m.role}
                  </span>
                </span>
                <button
                  onClick={() => revoke(m.id, m.name)}
                  className="text-xs text-[#ff8a8a] underline"
                >
                  Revoke
                </button>
              </li>
            ))}
            {list && list.length === 0 && (
              <li className="text-muted">
                No named members yet — just the workspace&apos;s own admin link.
              </li>
            )}
          </ul>

          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-1 flex-col gap-1 text-xs">
              <span className="text-muted">Add a member</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
                placeholder="Their name"
                maxLength={60}
                className="rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "owner" | "member")}
              className="rounded-lg border border-border bg-bg px-2 py-2 text-sm focus:border-accent focus:outline-none"
            >
              <option value="member">member</option>
              <option value="owner">owner</option>
            </select>
            <Button onClick={add} disabled={busy || !name.trim()}>
              {busy ? "Adding…" : "Add"}
            </Button>
          </div>
          {err && <p className="text-xs text-[#ff8a8a]">{err}</p>}

          {created && (
            <div className="rounded-lg border border-emerald-400/40 bg-emerald-400/5 p-3">
              <p className="text-sm text-emerald-300">
                Added <strong>{created.name}</strong>. Send them this sign-in link to
                bookmark — it&apos;s their key (shown once).
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(created.link).then(() => {
                      setLinkCopied(true);
                      setTimeout(() => setLinkCopied(false), 2000);
                    });
                  }}
                  className="rounded-lg border border-accent px-3 py-1.5 text-xs text-accent hover:bg-accent/10"
                >
                  {linkCopied ? "Link copied ✓" : "Copy sign-in link"}
                </button>
                <PasscodeReveal code={created.code} label="raw code" />
              </div>
              <button
                className="mt-2 text-xs text-muted underline"
                onClick={() => setCreated(null)}
              >
                Done
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// D3 — a workspace's BYO Anthropic key (owner-only). Write-only: the portal only
// ever learns whether a key is set + its last4. Setting one routes + bills this
// workspace's AI through its own Anthropic account; removing it falls back to the
// platform's shared key.
function AiKeyPanel({ code }: { code: string }) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<{ set: boolean; last4: string | null; secretsConfigured: boolean } | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/admin/ai-key?code=${encodeURIComponent(code)}`, {
      cache: "no-store",
    });
    if (res.ok) setInfo(await res.json());
  }, [code]);

  async function openPanel() {
    const next = !open;
    setOpen(next);
    if (next && info === null) await refresh();
  }

  async function save() {
    const key = draft.trim();
    if (!key) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/ai-key", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, key }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setDraft("");
        await refresh();
      } else {
        setErr(d.error ?? "Couldn't save the key.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Remove this workspace's key? Its AI falls back to the platform's shared key.")) return;
    await fetch("/api/admin/ai-key", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    await refresh();
  }

  return (
    <div className="mt-3 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted">
          AI key:{" "}
          <span className="text-white/90">
            {info === null
              ? "…"
              : info.set
                ? `your key · ····${info.last4}`
                : "platform's shared key"}
          </span>
        </p>
        <button onClick={openPanel} className="text-accent underline">
          {open ? "Close" : "Manage"}
        </button>
      </div>

      {open && info && (
        <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
          {!info.secretsConfigured ? (
            <p className="text-xs text-muted">
              Bringing your own key isn&apos;t enabled on this instance (no
              encryption key configured). The platform&apos;s shared AI key is in use.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted">
                Set your own Anthropic API key and this workspace&apos;s AI (session
                reports, synthesis, design help) routes + bills through your own
                account. It&apos;s encrypted at rest and never shown again.
              </p>
              {info.set ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-bg px-2 py-1 font-mono text-xs text-muted">
                    sk-…{info.last4}
                  </span>
                  <button onClick={remove} className="text-xs text-[#ff8a8a] underline">
                    Remove
                  </button>
                </div>
              ) : null}
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-1 flex-col gap-1 text-xs">
                  <span className="text-muted">{info.set ? "Replace with a new key" : "Anthropic API key"}</span>
                  <input
                    type="password"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && save()}
                    placeholder="sk-ant-…"
                    className="rounded-lg border border-border bg-bg px-3 py-2 font-mono text-sm focus:border-accent focus:outline-none"
                  />
                </label>
                <Button onClick={save} disabled={busy || !draft.trim()}>
                  {busy ? "Saving…" : "Save key"}
                </Button>
              </div>
              {err && <p className="text-xs text-[#ff8a8a]">{err}</p>}
            </>
          )}
        </div>
      )}
    </div>
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

// A5 — "My workshops": group the rooms into Live now / Drafts / Recent so a busy
// facilitator finds the live session at a glance and re-opens a recent archive,
// with a calm trust banner about the 24h wipe.
function MyWorkshops({
  rooms,
  code,
  onChanged,
}: {
  rooms: RoomRow[];
  code: string;
  onChanged: () => void;
}) {
  const { live, drafts, recent } = groupRooms(rooms);
  const Section = ({ title, items }: { title: string; items: RoomRow[] }) =>
    items.length === 0 ? null : (
      <>
        <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">
          {title} <span className="text-muted/50">· {items.length}</span>
        </h3>
        {items.map((r) => (
          <RoomCard key={r.slug} room={r} code={code} onChanged={onChanged} />
        ))}
      </>
    );
  return (
    <>
      <div className="rounded-lg border border-border bg-bg/40 px-3 py-2 text-xs text-muted">
        Rooms auto-wipe 24h after they end — only the design and a content-free
        summary persist. Nothing here is shared until you share it.
      </div>
      <Section title="Live now" items={live} />
      <Section title="Drafts" items={drafts} />
      <Section title="Recent" items={recent} />
    </>
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
  const [panel, setPanel] = useState<
    "theme" | "report" | "access" | "address" | null
  >(null);
  const [theme, setTheme] = useState<ThemeDraft>(EMPTY_THEME);
  const [report, setReport] = useState<any>(null);
  // A4 — inline-edit the display name (never the slug — that's the room's key).
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(room.name);
  // A5 — duplicate this room's design into a fresh room; show the new codes once.
  const [dupCreated, setDupCreated] = useState<{
    slug: string;
    name: string;
    passcodes: { admin: string; facilitator: string; cohost: string; projector: string };
  } | null>(null);
  const [dupBusy, setDupBusy] = useState(false);
  async function duplicate() {
    setDupBusy(true);
    try {
      const res = await fetch("/api/admin/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duplicateOf: room.slug, code }),
      });
      const data = await res.json();
      if (res.ok) {
        setDupCreated(data);
        onChanged();
      }
    } finally {
      setDupBusy(false);
    }
  }
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
  // A4 — change the room's address (slug). Non-live only; old links redirect.
  const [slugDraft, setSlugDraft] = useState(room.slug);
  const [slugBusy, setSlugBusy] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  async function renameSlug() {
    const next = slugDraft.trim();
    if (!next || next === room.slug) {
      setPanel(null);
      return;
    }
    setSlugBusy(true);
    setSlugError(null);
    try {
      const res = await fetch(`/api/admin/rooms/${room.slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, action: "rename", slug: next }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setPanel(null);
        onChanged();
      } else {
        setSlugError(d.error ?? "Couldn't change the address.");
      }
    } finally {
      setSlugBusy(false);
    }
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
            /{room.slug}{" "}
            {/* A1 — at-a-glance draft / live / archived badge. */}
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                room.status === "live"
                  ? "bg-emerald-500/20 text-emerald-300"
                  : room.status === "archived"
                    ? "bg-white/10 text-muted"
                    : "bg-accent/20 text-accent"
              }`}
            >
              {room.status}
            </span>
            {room.lastRun && (
              <span>
                {" "}· last run: {room.lastRun.participantCount} joined,{" "}
                {room.lastRun.submissionCount} contributions
              </span>
            )}
            {/* C3 — attribution in the shared workspace rooms list. */}
            {room.createdBy && <span> · by {room.createdBy}</span>}
          </p>
          {/* A5 — the saved design at a glance. */}
          {room.blueprint && room.blueprint.chips.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {room.blueprint.chips.slice(0, 6).map((c, i) => (
                <span key={i} className="rounded-full bg-bg px-1.5 py-0.5 text-[10px] text-muted">
                  {c}
                </span>
              ))}
              {room.blueprint.chips.length > 6 && (
                <span className="text-[10px] text-muted">+{room.blueprint.chips.length - 6}</span>
              )}
            </div>
          )}
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
          <button onClick={duplicate} disabled={dupBusy} className="text-accent">
            {dupBusy ? "duplicating…" : "duplicate"}
          </button>
          {room.status !== "live" && (
            <button
              onClick={() => {
                setSlugDraft(room.slug);
                setSlugError(null);
                setPanel(panel === "address" ? null : "address");
              }}
            >
              address
            </button>
          )}
          {room.status === "draft" && (
            <button onClick={markLive} className="text-emerald-400">make live</button>
          )}
          <button onClick={del} className="text-[#ff8a8a]">delete</button>
        </div>
      </div>

      {/* A5 — the duplicate's fresh passcodes, shown once. */}
      {dupCreated && (
        <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
          <p className="text-xs text-emerald-400">
            Duplicated the design into a fresh room — new passcodes (shown once):
          </p>
          <RoomAccessCard
            slug={dupCreated.slug}
            name={dupCreated.name}
            codes={dupCreated.passcodes}
          />
          <button
            className="self-start text-xs text-muted underline"
            onClick={() => setDupCreated(null)}
          >
            Done — close
          </button>
        </div>
      )}

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

      {/* A4 — change the shareable address. Old links/QRs redirect to the new
          slug, so nothing in someone's pocket breaks. Live rooms are excluded. */}
      {panel === "address" && (
        <div className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
          <label className="block text-xs text-muted" htmlFor={`slug-${room.slug}`}>
            New address — letters, numbers and hyphens. The old link will redirect here.
          </label>
          <div className="flex items-center gap-2">
            <span className="text-muted">/r/</span>
            <input
              id={`slug-${room.slug}`}
              autoFocus
              value={slugDraft}
              onChange={(e) => setSlugDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") renameSlug();
                if (e.key === "Escape") setPanel(null);
              }}
              maxLength={60}
              className="flex-1 rounded border border-border bg-bg px-2 py-1 font-mono text-sm focus:border-accent focus:outline-none"
            />
            <Button onClick={renameSlug} disabled={slugBusy}>
              {slugBusy ? "Changing…" : "Change"}
            </Button>
          </div>
          {slugError && <p className="text-xs text-[#ff8a8a]">{slugError}</p>}
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
              {/* F1 — admin parity: the same branded client-ready document + export
                  row the host gets, so the report can be sent straight from /admin. */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => window.print()}
                  className="rounded-lg border border-accent px-3 py-1.5 text-xs text-accent hover:bg-accent/10"
                >
                  Print / Save as PDF
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(reportToMarkdown(report));
                  }}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:border-accent"
                >
                  Copy as Markdown
                </button>
              </div>
              {/* F2 — send-after export of the captured action items. */}
              <ActionItemsExport items={report.actionItems} slug={room.slug} />
              <div className="report-print overflow-hidden rounded-lg">
                <ReportDocument archive={report} />
              </div>
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
