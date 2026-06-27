// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PasscodeReveal } from "@/components/PasscodeReveal";

// A1/A5 — the shared raw-passcode reveal. Hidden by default (the link is the
// key); the plaintext only appears after an explicit "Show code" tap.

describe("PasscodeReveal", () => {
  it("hides the code until 'Show code' is tapped", () => {
    render(<PasscodeReveal code="onyx-secret-123" />);
    // hidden by default — the plaintext is not in the DOM
    expect(screen.queryByText("onyx-secret-123")).toBeNull();
    expect(screen.getByText("Show code")).toBeTruthy();
    fireEvent.click(screen.getByText("Show code"));
    expect(screen.getByText("onyx-secret-123")).toBeTruthy();
    expect(screen.getByText("Hide code")).toBeTruthy();
  });

  it("honours a custom label", () => {
    render(<PasscodeReveal code="abc" label="admin code" />);
    expect(screen.getByText("Show admin code")).toBeTruthy();
  });
});
