// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

function GoodChild() {
  return <p>All good here</p>;
}

function Boom(): never {
  throw new Error("kaboom");
}

describe("ErrorBoundary", () => {
  // React logs the caught render error to console.error by design — silence it
  // so the test output stays clean (the throw is expected).
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it("renders children when they don't throw", () => {
    render(
      <ErrorBoundary>
        <GoodChild />
      </ErrorBoundary>,
    );
    expect(screen.getByText("All good here")).toBeInTheDocument();
  });

  it("renders the default fallback when a child throws during render", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(
      screen.getByText("Something hiccuped on this screen."),
    ).toBeInTheDocument();
    expect(screen.queryByText("All good here")).not.toBeInTheDocument();
  });

  it("renders a custom fallback when provided", () => {
    render(
      <ErrorBoundary fallback={<p>custom fallback copy</p>}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText("custom fallback copy")).toBeInTheDocument();
    expect(
      screen.queryByText("Something hiccuped on this screen."),
    ).not.toBeInTheDocument();
  });
});
