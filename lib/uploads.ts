export type SafeUploadKind = "png" | "jpeg" | "gif" | "webp" | "pdf";

const MIME: Record<SafeUploadKind, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
};

function starts(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

export async function inspectUpload(
  file: File,
  allowPdf: boolean,
): Promise<{ kind: SafeUploadKind; contentType: string } | null> {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  let kind: SafeUploadKind | null = null;
  if (starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) kind = "png";
  else if (starts(bytes, [0xff, 0xd8, 0xff])) kind = "jpeg";
  else if (new TextDecoder().decode(bytes.slice(0, 6)).match(/^GIF8[79]a$/)) kind = "gif";
  else if (
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
  ) kind = "webp";
  else if (allowPdf && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-") kind = "pdf";
  return kind ? { kind, contentType: MIME[kind] } : null;
}
