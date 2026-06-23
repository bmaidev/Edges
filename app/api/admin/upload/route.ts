import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { checkSuperAdmin } from "@/lib/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/upload?code=ADMIN  (multipart form, field "file")
// Stores an image in Vercel Blob and returns its public URL — used by the admin
// theme panel to set a room's logo without pasting a URL.
export async function POST(req: NextRequest) {
  if (!checkSuperAdmin(req.nextUrl.searchParams.get("code")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
  if (!file.type.startsWith("image/"))
    return NextResponse.json({ error: "Images only" }, { status: 400 });
  if (file.size > 4 * 1024 * 1024)
    return NextResponse.json({ error: "Image must be under 4 MB" }, { status: 400 });

  const safeName = (file.name || "logo").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
  try {
    const blob = await put(`logos/${Date.now()}-${safeName}`, file, {
      access: "public",
      contentType: file.type,
    });
    return NextResponse.json({ url: blob.url });
  } catch {
    return NextResponse.json({ error: "Upload failed — try again." }, { status: 502 });
  }
}
