"use client";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { getClientRenderer } from "@/lib/modules/registry.client";
import { getSampleView } from "@/lib/modules/sample-views";
import type { ModuleKind } from "@/lib/types";

// B2 — an inert, read-only mockup of what a phase puts on the participant phone
// and the projector, fed config-reactive SAMPLE data and rendered through the
// real renderers. Un-submittable (pointer-events-none + act no-ops); touches no
// room, store, or real participant.
export function RoomMockup({
  moduleId,
  config,
}: {
  moduleId: ModuleKind;
  config: Record<string, unknown>;
}) {
  const view = getSampleView(moduleId, config);
  const Participant = getClientRenderer(moduleId, "participant");
  const Projector = getClientRenderer(moduleId, "projector");

  if (view === null) {
    return (
      <Note>
        A live preview for <b>{moduleId}</b> is coming soon — launch the room to
        see it for now.
      </Note>
    );
  }
  if (!Participant && !Projector) {
    return <Note>This phase has no participant screen — it&apos;s display-only.</Note>;
  }

  const inert = { token: "", handle: "", phaseId: "preview", act: async () => false };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Participant && (
        <Frame label="On their phone" phone>
          <ErrorBoundary label={`preview:${moduleId}:participant`} resetKey={JSON.stringify(config)}>
            <Participant view={view} {...inert} />
          </ErrorBoundary>
        </Frame>
      )}
      {Projector && (
        <Frame label="On the projector">
          <ErrorBoundary label={`preview:${moduleId}:projector`} resetKey={JSON.stringify(config)}>
            <Projector view={view} {...inert} />
          </ErrorBoundary>
        </Frame>
      )}
    </div>
  );
}

function Frame({
  label,
  phone,
  children,
}: {
  label: string;
  phone?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <div
        className={`pointer-events-none overflow-hidden rounded-xl border border-border bg-bg ${
          phone ? "mx-auto max-w-[16rem]" : ""
        }`}
      >
        <div className="max-h-72 origin-top overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-bg px-3 py-2 text-xs text-muted">
      {children}
    </div>
  );
}
