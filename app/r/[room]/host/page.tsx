"use client";

import { use } from "react";
import { HostConsole } from "@/components/HostConsole";

export default function HostPage({
  params,
}: {
  params: Promise<{ room: string }> | { room: string };
}) {
  const p = params instanceof Promise ? use(params) : params;
  return <HostConsole apiBase={`/api/r/${p.room}`} roomName={`Room ${p.room}`} />;
}
