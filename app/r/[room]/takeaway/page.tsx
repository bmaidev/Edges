import { getTakeaway } from "@/lib/store";
import { TakeawayScreen } from "@/components/TakeawayScreen";
import type { Metadata } from "next";

// F3 — the token-gated public recap (cold path: a scanned QR / a kept link).
// Dynamic + noindex so an expired link is never served stale or indexed.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function TakeawayPage({
  params,
  searchParams,
}: {
  params: { room: string };
  searchParams: { k?: string };
}) {
  const token = searchParams.k ?? "";
  const snapshot = await getTakeaway(params.room, token);

  if (!snapshot) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg p-8 text-center text-muted">
        <p className="max-w-sm leading-relaxed">
          This recap has expired or doesn&apos;t exist. Session recaps are kept for
          24 hours, then they&apos;re gone for good.
        </p>
      </main>
    );
  }

  // F3 — the public page is the SHARED body only: strip the raw contributions
  // (no personal token here, so no one's individual answers are shown).
  const { contributions, ...shared } = snapshot;
  void contributions;
  return (
    <main className="min-h-screen bg-bg py-6 text-white">
      <TakeawayScreen takeaway={{ ...shared, token }} />
    </main>
  );
}
