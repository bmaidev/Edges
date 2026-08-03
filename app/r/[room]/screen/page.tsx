"use client";

import { use } from "react";
import { ProjectorApp } from "@/components/ProjectorApp";

export default function ScreenPage({
  params,
}: {
  params: Promise<{ room: string }>;
}) {
  const p = use(params);
  return <ProjectorApp apiBase={`/api/r/${p.room}`} />;
}
