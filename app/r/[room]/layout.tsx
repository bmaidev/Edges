import { getRoom } from "@/lib/rooms";

export const dynamic = "force-dynamic";

function hexToRgbTriple(hex: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

const VAR: Record<string, string> = {
  bg: "--c-bg",
  surface: "--c-surface",
  accent: "--c-accent",
  muted: "--c-muted",
  border: "--c-border",
};

// Per-room shell: overrides the CSS-variable palette from the room's theme so
// every view under /r/[room] picks up the room's branding.
export default async function RoomLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { room: string };
}) {
  const room = await getRoom(params.room);
  const palette = room?.theme?.palette ?? {};
  const lines: string[] = [];
  for (const [key, hex] of Object.entries(palette)) {
    const v = VAR[key];
    const rgb = hex ? hexToRgbTriple(hex) : null;
    if (v && rgb) lines.push(`${v}: ${rgb};`);
  }

  return (
    <>
      {lines.length > 0 && (
        <style
          // Scoped to this room's pages; overrides :root defaults.
          dangerouslySetInnerHTML={{ __html: `:root{${lines.join("")}}` }}
        />
      )}
      {children}
    </>
  );
}
