export function authFetch(
  input: RequestInfo | URL,
  code: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("X-Edges-Code", code);
  return fetch(input, { ...init, headers });
}

export async function downloadAuthenticated(
  url: string,
  code: string,
  filename: string,
): Promise<void> {
  const response = await authFetch(url, code, { cache: "no-store" });
  if (!response.ok) return;
  const objectUrl = URL.createObjectURL(await response.blob());
  try {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    link.click();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
