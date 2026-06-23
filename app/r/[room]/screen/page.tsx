"use client";

import { use } from "react";
import { ProjectorApp } from "@/components/ProjectorApp";

export default function ScreenPage({
  params,
}: {
  params: Promise<{ room: string }> | { room: string };
}) {
  const p = params instanceof Promise ? use(params) : params;
  return <ProjectorApp apiBase={`/api/r/${p.room}`} />;
}
