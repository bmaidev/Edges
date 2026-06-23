import { NextRequest } from "next/server";
import { roomSignature } from "@/lib/store";
import { getRoom } from "@/lib/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/r/[room]/stream — short-lived SSE. Emits a "tick" whenever the room's
// change signature moves; clients re-fetch full state on tick. Closes after
// ~25s so it stays within serverless duration limits; EventSource auto-reconnects.
// Polling remains the fallback in the client, so this is purely an accelerator.
export async function GET(
  req: NextRequest,
  { params }: { params: { room: string } },
) {
  const room = params.room;
  if (!(await getRoom(room)))
    return new Response("no such room", { status: 404 });

  const encoder = new TextEncoder();
  const POLL_MS = 1500;
  const MAX_MS = 25_000;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: string) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));

      let last = "";
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      req.signal.addEventListener("abort", close);

      send("ready", "1");
      const started = Date.now();
      try {
        while (!closed && Date.now() - started < MAX_MS) {
          const sig = await roomSignature(room);
          if (sig !== last) {
            last = sig;
            send("tick", String(Date.now()));
          } else {
            send("ping", "1"); // keepalive
          }
          await new Promise((r) => setTimeout(r, POLL_MS));
        }
      } catch {
        // swallow — client will reconnect / fall back to polling
      } finally {
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
    },
  });
}
