import { getArchive, getRoom } from "@/lib/rooms";
import { ReportDocument } from "@/lib/report/ReportDocument";
import type { Metadata } from "next";

// F1 — the token-gated PUBLIC report (a kept link the facilitator shares). Server-
// rendered: ReportDocument is a pure component, so the archive (which holds raw
// submissions) renders to synthesis-only HTML — the raw responses never reach the
// client. Dynamic + noindex so a bad link can't be served stale or indexed.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PublicReportPage({
  params,
  searchParams,
}: {
  params: { room: string };
  searchParams: { k?: string };
}) {
  const token = searchParams.k ?? "";
  const archive = await getArchive(params.room);

  if (!archive || !archive.reportToken || archive.reportToken !== token) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg p-8 text-center text-muted">
        <p className="max-w-sm leading-relaxed">
          This report link is invalid or has been revoked.
        </p>
      </main>
    );
  }

  const room = await getRoom(params.room);
  const t = room?.theme;
  const branding = t
    ? { logoUrl: t.logoUrl, accent: t.palette?.accent, headline: t.headline }
    : undefined;

  return (
    <main className="min-h-screen bg-[#f3f3f5] py-8">
      <ReportDocument archive={archive} branding={branding} />
    </main>
  );
}
