import Link from "next/link";
import { signupPolicy } from "@/lib/signup";

export const dynamic = "force-dynamic";

// Phase E — the front door. A calm landing that says what Edges is, points an
// individual or org at "Create your workspace" (when sign-up is open) and a
// returning facilitator at "Sign in", and links the open-source / self-host path.
// Server component: reads the signup policy directly, so there's no fetch flash.
export default function Page() {
  const canSignup = signupPolicy() !== "closed";

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-16 text-center">
      {/* a soft accent glow behind the hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/3 -z-0 h-[40rem] w-[40rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/10 blur-[120px]"
      />

      <div className="relative z-10 flex max-w-2xl flex-col items-center gap-7">
        <p className="text-xs uppercase tracking-[0.35em] text-muted">Edges</p>

        <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          Run great workshops
          <br />
          <span className="text-accent">from a phone.</span>
        </h1>

        <p className="max-w-xl text-lg leading-relaxed text-white/80">
          A calm, privacy-first facilitation platform. Participants join on their
          own devices, the room shares a projector, and you drive everything from
          one console — World Café, 1-2-4-All, dot-voting, gradients of agreement,
          and dozens more, each a few taps to set up.
        </p>

        {/* the ethos, as three quiet chips */}
        <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted">
          {["Off-the-record", "24-hour auto-erase", "No accounts for participants"].map(
            (t) => (
              <span key={t} className="rounded-full border border-border px-3 py-1">
                {t}
              </span>
            ),
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          {canSignup ? (
            <>
              <Link
                href="/start"
                className="rounded-xl bg-accent px-6 py-3 font-medium text-bg transition-colors hover:bg-accent/90"
              >
                Create your workspace
              </Link>
              <Link
                href="/admin"
                className="rounded-xl border border-border px-6 py-3 font-medium text-white/90 hover:border-accent"
              >
                Sign in
              </Link>
            </>
          ) : (
            <Link
              href="/admin"
              className="rounded-xl bg-accent px-6 py-3 font-medium text-bg transition-colors hover:bg-accent/90"
            >
              Sign in to your workspace
            </Link>
          )}
        </div>

        <p className="mt-6 text-xs text-muted">
          Free and open source —{" "}
          <a
            href="https://github.com/bmaidev/Edges"
            className="text-accent underline"
            target="_blank"
            rel="noreferrer"
          >
            host your own instance
          </a>
          .
        </p>
      </div>
    </main>
  );
}
