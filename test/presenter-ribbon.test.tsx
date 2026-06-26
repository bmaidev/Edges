// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PresenterRibbon } from "@/components/PresenterRibbon";
import type { SequenceItem } from "@/lib/sequence";

// E2 — the presenter ribbon is a pure derivation from PublicState; this proves it
// renders the now/next/position from a real sequence and degrades cleanly.

const seq: SequenceItem[] = [
  { id: "a", label: "Opening", moduleId: "capture" },
  { id: "b", label: "Diverge", moduleId: "capture" },
  { id: "c", label: "Converge", moduleId: "poll" },
];

describe("PresenterRibbon", () => {
  it("shows NOW + NEXT + position for a mid-sequence phase", () => {
    render(
      <PresenterRibbon
        sequence={seq}
        phaseId="b"
        fallbackLabel="Topic"
        timerEndsAt={null}
        timerRemainingMs={null}
      />,
    );
    expect(screen.getByText("Diverge")).toBeTruthy(); // NOW
    expect(screen.getByText("Converge")).toBeTruthy(); // NEXT
    expect(screen.getByText("2 / 3")).toBeTruthy(); // position
  });

  it("falls back to the given label when there's no sequence (lobby)", () => {
    render(
      <PresenterRibbon
        sequence={[]}
        phaseId={null}
        fallbackLabel="Welcome"
        timerEndsAt={null}
        timerRemainingMs={null}
      />,
    );
    expect(screen.getByText("Welcome")).toBeTruthy();
    expect(screen.queryByText(/\d+ \/ \d+/)).toBeNull(); // no position with no sequence
  });

  it("shows no NEXT on the final phase", () => {
    render(
      <PresenterRibbon
        sequence={seq}
        phaseId="c"
        fallbackLabel="Topic"
        timerEndsAt={null}
        timerRemainingMs={null}
      />,
    );
    expect(screen.getByText("Converge")).toBeTruthy(); // NOW
    expect(screen.getByText("3 / 3")).toBeTruthy();
    expect(screen.queryByText("Next")).toBeNull();
  });
});
