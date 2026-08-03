"use client";

import { ModuleCardBody } from "@/components/ModuleCard";
import { MODULE_CATEGORIES } from "@/lib/modules/categories";
import { MODULE_EXPERIENCE } from "@/lib/modules/experience";
import { SERVER_MODULES } from "@/lib/modules/registry.server";
import type { ModuleKind } from "@/lib/types";

// B6 — the LIVE method reference on /help: every method you can place in a session,
// grouped, with its card triple (what it is / best for / the room does) pulled
// straight from the real module cards — so this page can never drift from the
// builder's palette.
export function MethodReference() {
  return (
    <div className="flex flex-col gap-7">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Method reference
        </h1>
        <p className="mt-1 text-sm text-muted">
          Every method you can place in a session — what it is, when to reach
          for it, and what a participant actually does. Compose any of these in
          the builder.
        </p>
      </div>
      {MODULE_CATEGORIES.map((cat) => {
        const kinds = cat.kinds.filter((k) => SERVER_MODULES[k]);
        if (kinds.length === 0) return null;
        return (
          <section key={cat.label} className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-accent">
              {cat.label}
            </h2>
            <div className="flex flex-col gap-3">
              {kinds.map((k) => (
                <div
                  key={k}
                  className="rounded-xl border border-border bg-surface p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-white/90">
                      {nameOf(k)}
                    </p>
                    <span className="rounded-full bg-bg/70 px-2 py-0.5 text-[10px] capitalize text-muted">
                      {MODULE_EXPERIENCE[k].complexity}
                    </span>
                  </div>
                  <ModuleCardBody moduleId={k} />
                  <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                    <ReferenceDetail
                      label="Needs"
                      body={MODULE_EXPERIENCE[k].input}
                    />
                    <ReferenceDetail
                      label="Facilitation watch-out"
                      body={MODULE_EXPERIENCE[k].watchFor}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function nameOf(id: ModuleKind): string {
  return SERVER_MODULES[id]?.meta.name ?? id;
}

function ReferenceDetail({ label, body }: { label: string; body: string }) {
  return (
    <div className="rounded-md border border-border/70 px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 leading-snug text-white/75">{body}</p>
    </div>
  );
}
