"use client";

import { use } from "react";
import { ParticipantApp } from "@/components/ParticipantApp";

// Participant entry for a specific room: /r/[room]
export default function RoomPage({
  params,
}: {
  params: Promise<{ room: string }>;
}) {
  const p = use(params);
  return <ParticipantApp apiBase={`/api/r/${p.room}`} />;
}
