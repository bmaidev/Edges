// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Page from "@/app/page";

// Phase E4 — the front door. Policy-aware CTAs: open sign-up shows both "Create
// your workspace" (→/start) and "Sign in" (→/admin); closed shows only sign-in.

afterEach(() => {
  delete process.env.SIGNUP_OPEN;
  delete process.env.SIGNUP_CODE;
});

function hrefOf(text: RegExp): string | null {
  return screen.getByText(text).closest("a")?.getAttribute("href") ?? null;
}

describe("landing page", () => {
  it("with sign-up open, offers Create-workspace (/start) + Sign-in (/admin)", () => {
    process.env.SIGNUP_OPEN = "true";
    render(<Page />);
    expect(hrefOf(/create your workspace/i)).toBe("/start");
    expect(hrefOf(/^sign in$/i)).toBe("/admin");
    // the self-host / open-source link is always present
    expect(screen.getByText(/host your own instance/i).closest("a")?.getAttribute("href")).toContain(
      "github.com/bmaidev/Edges",
    );
  });

  it("with sign-up closed, shows only the sign-in CTA (no /start)", () => {
    // neither SIGNUP_OPEN nor SIGNUP_CODE → closed
    render(<Page />);
    expect(screen.queryByText(/create your workspace/i)).toBeNull();
    expect(hrefOf(/sign in to your workspace/i)).toBe("/admin");
  });
});
