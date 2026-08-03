import { getArchive, getRoom } from "@/lib/rooms";
import { ReportDocument } from "@/lib/report/ReportDocument";
import type { Metadata } from "next";

// F1 — the token-gated PUBLIC report (a kept link the facilitator shares). Server-
// rendered: ReportDocument is a pure component and the durable archive itself is
// synthesis-only. Dynamic + noindex so a bad link can't be served stale/indexed.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PublicReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ room: string }>;
  searchParams: Promise<{ k?: string }>;
}) {
  const [{ room }, query] = await Promise.all([params, searchParams]);
  const token = query.k ?? "";
  const archive = await getArchive(room);

  if (!archive || !archive.reportToken || archive.reportToken !== token) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg p-8 text-center text-muted">
        <p className="max-w-sm leading-relaxed">
          This report link is invalid or has been revoked.
        </p>
      </main>
    );
  }

  const roomRecord = await getRoom(room);
  const t = roomRecord?.theme;
  const branding = t
    ? { logoUrl: t.logoUrl, accent: t.palette?.accent, headline: t.headline }
    : undefined;

  return (
    <main className="min-h-screen bg-[#f3f3f5] py-8">
      <ReportDocument archive={archive} branding={branding} />
    </main>
  );
}
