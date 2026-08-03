"use client";

import { getCard, producesRoomText, promptOf } from "@/lib/modules/cards";
import { MODULE_EXPERIENCE } from "@/lib/modules/experience";
import { SERVER_MODULES } from "@/lib/modules/registry.server";
import type { ModuleKind } from "@/lib/types";

// B6 — the builder's method cards + the prompt-aware "feeds into" source field.

const nameOf = (id: ModuleKind): string => SERVER_MODULES[id]?.meta.name ?? id;

// A palette chip reads as a method, not a jargon token: name + a one-line
// "best for", with the full card on hover.
export function PaletteChip({
  moduleId,
  onAdd,
}: {
  moduleId: ModuleKind;
  onAdd: () => void;
}) {
  const card = getCard(moduleId);
  const experience = MODULE_EXPERIENCE[moduleId];
  return (
    <button
      onClick={onAdd}
      title={`${card.whatItIs}\n\nBest for: ${card.bestFor}\nThe room: ${card.roomDoes}`}
      className="flex max-w-[15rem] flex-col items-start gap-0.5 rounded-lg border border-border bg-surface px-3 py-2 text-left hover:border-accent"
    >
      <span className="flex w-full items-center justify-between gap-2 text-xs font-medium">
        <span>+ {nameOf(moduleId)}</span>
        <span className="rounded-full bg-bg/70 px-1.5 py-0.5 text-[9px] font-normal capitalize text-muted">
          {experience.complexity}
        </span>
      </span>
      <span className="text-[10px] leading-snug text-muted">
        {card.bestFor}
      </span>
    </button>
  );
}

// B6 — the full method card triple (what it is / best for / the room does), the
// single source of truth shared by the builder's placed-phase card AND the /help
// method reference, so the docs can never drift from the real cards.
export function ModuleCardBody({ moduleId }: { moduleId: ModuleKind }) {
  const card = getCard(moduleId);
  const experience = MODULE_EXPERIENCE[moduleId];
  return (
    <div className="mt-1 grid gap-1 text-xs sm:grid-cols-2 lg:grid-cols-4">
      <Cell label="What it is" body={card.whatItIs} />
      <Cell label="Best for" body={card.bestFor} />
      <Cell label="The room does" body={card.roomDoes} />
      <Cell label="Leaves you with" body={experience.output} />
    </div>
  );
}

// The triple above a placed phase's config form (alias kept for the builder).
export const PlacedPhaseCard = ModuleCardBody;

function Cell({ label, body }: { label: string; body: string }) {
  return (
    <div className="rounded-md bg-bg/50 px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 leading-snug text-white/80">{body}</p>
    </div>
  );
}

// B6 — the dependency explainer. Instead of a bare phase-id dropdown, this reads
// as plain English tied to the facilitator's own prompt: "Reads what the room
// wrote in '…'". Four honest states: optional-unset, required-unset,
// none-eligible, and wired.
export function SourceField({
  value,
  optional,
  earlierPhases,
  onChange,
}: {
  value: string;
  optional: boolean;
  earlierPhases: {
    id: string;
    moduleId: ModuleKind;
    config: Record<string, unknown>;
  }[];
  onChange: (v: string | undefined) => void;
}) {
  const producers = earlierPhases.filter((p) =>
    producesRoomText(p.moduleId, p.config),
  );
  const selected = earlierPhases.find((p) => p.id === value) ?? null;
  const selectedProduces = selected
    ? producesRoomText(selected.moduleId, selected.config)
    : false;

  let hint: string;
  if (selected && selectedProduces) {
    const q = promptOf(selected.config);
    hint = q
      ? `Reads what the room wrote in “${q}”.`
      : "Reads that phase's contributions.";
  } else if (selected) {
    hint =
      "That phase does not produce reusable text. Choose an earlier writing activity.";
  } else if (optional) {
    hint =
      "Reads everything the room has written so far — or pick one phase to focus.";
  } else if (producers.length === 0) {
    hint =
      "Add a capture, pre-work, or another writing activity before this one.";
  } else {
    hint = "Pick which earlier phase this reads from.";
  }

  // Only offer phases that actually create submissions. Preserve a legacy
  // invalid selection just long enough for the author to see and replace it.
  const ranked =
    selected && !selectedProduces
      ? [selected, ...producers.filter((phase) => phase.id !== selected.id)]
      : producers;

  return (
    <div className="flex flex-col gap-1">
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
      >
        <option value="">
          {optional ? "All contributions so far" : "Select a phase…"}
        </option>
        {ranked.map((p) => (
          <option key={p.id} value={p.id}>
            {p.id} · {nameOf(p.moduleId)}
            {producesRoomText(p.moduleId, p.config)
              ? " ✓"
              : " ⚠ no reusable text"}
          </option>
        ))}
      </select>
      <span className="text-[11px] text-muted">{hint}</span>
    </div>
  );
}
