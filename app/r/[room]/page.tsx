"use client";

import { use } from "react";
import { ParticipantApp } from "@/components/ParticipantApp";

// Participant entry for a specific room: /r/[room]
export default function RoomPage({
  params,
}: {
  params: Promise<{ room: string }> | { room: string };
}) {
  // Next 14 passes params as an object; tolerate a promise too (forward-compat).
  const p = params instanceof Promise ? use(params) : params;
  return <ParticipantApp apiBase={`/api/r/${p.room}`} />;
}
