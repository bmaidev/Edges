import { describe, expect, it } from "vitest";
import { inspectUpload } from "@/lib/uploads";

function upload(bytes: number[], name = "upload.bin", type = "text/html") {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("upload content inspection", () => {
  it("trusts image magic bytes rather than the claimed MIME type", async () => {
    const png = upload([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "x.html");
    expect(await inspectUpload(png, false)).toEqual({
      kind: "png",
      contentType: "image/png",
    });
  });

  it("rejects HTML renamed as an image", async () => {
    const html = upload(Array.from(new TextEncoder().encode("<script>alert(1)</script>")), "x.png", "image/png");
    expect(await inspectUpload(html, true)).toBeNull();
  });

  it("accepts PDFs only on the presenter-media path", async () => {
    const pdf = upload(Array.from(new TextEncoder().encode("%PDF-1.7")), "slides.pdf", "application/pdf");
    expect(await inspectUpload(pdf, false)).toBeNull();
    expect(await inspectUpload(pdf, true)).toEqual({
      kind: "pdf",
      contentType: "application/pdf",
    });
  });
});
