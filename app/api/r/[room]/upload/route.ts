import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getRoom } from "@/lib/rooms";
import { requireCapability } from "@/lib/auth";
import { rateLimitResponse, requestCode } from "@/lib/request-security";
import { inspectUpload } from "@/lib/uploads";
import { trackRoomUpload } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/r/[room]/upload + X-Edges-Code (multipart form, field "file")
// Stores a presentation image in Vercel Blob and returns its public URL. Used by
// the media module's facilitator deck-builder. Gated by the "inject" capability
// (facilitators + co-hosts), NOT the super-admin upload that logos use.
//
// Uploaded presenter media is tracked in the room's TTL store and deleted from
// Blob on End/Archive; it is never accepted as participant-authored content.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ room: string }> },
) {
  const { room } = await params;
  const limited = await rateLimitResponse(req, `upload:${room}`, { limit: 10 });
  if (limited) return limited;
  if (!(await getRoom(room)))
    return NextResponse.json({ error: "No such room" }, { status: 404 });

  const { ok } = await requireCapability(
    room,
    requestCode(req),
    "inject",
  );
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!process.env.BLOB_READ_WRITE_TOKEN)
    return NextResponse.json(
      { error: "Blob storage isn't linked to this project yet." },
      { status: 503 },
    );

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File))
    return NextResponse.json({ error: "No file" }, { status: 400 });

  const inspected = await inspectUpload(file, true);
  if (!inspected)
    return NextResponse.json({ error: "Images or PDF only" }, { status: 400 });
  // PDFs are split into page images client-side, so what arrives here is almost
  // always an image; allow a larger ceiling for a raw PDF just in case.
  const limit = inspected.kind === "pdf" ? 25 : 8;
  if (file.size > limit * 1024 * 1024)
    return NextResponse.json(
      { error: `File must be under ${limit} MB` },
      { status: 400 },
    );

  const safeName = (file.name || "slide").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
  try {
    const blob = await put(`media/${room}/${Date.now()}-${safeName}`, file, {
      access: "public",
      contentType: inspected.contentType,
    });
    await trackRoomUpload(blob.url, room);
    return NextResponse.json({ url: blob.url });
  } catch {
    return NextResponse.json({ error: "Upload failed — try again." }, { status: 502 });
  }
}
