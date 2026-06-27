"use client";

import { ModuleCardBody } from "@/components/ModuleCard";
import { MODULE_CATEGORIES } from "@/lib/modules/categories";
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
        <h1 className="font-display text-2xl font-semibold tracking-tight">Method reference</h1>
        <p className="mt-1 text-sm text-muted">
          Every method you can place in a session — what it is, when to reach for it, and
          what a participant actually does. Compose any of these in the builder.
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
                <div key={k} className="rounded-xl border border-border bg-surface p-3">
                  <p className="text-sm font-medium text-white/90">{nameOf(k)}</p>
                  <ModuleCardBody moduleId={k} />
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
