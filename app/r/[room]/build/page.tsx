"use client";

import { use } from "react";
import { BuilderApp } from "@/components/BuilderApp";

export default function BuildPage({
  params,
}: {
  params: Promise<{ room: string }> | { room: string };
}) {
  const p = params instanceof Promise ? use(params) : params;
  return <BuilderApp apiBase={`/api/r/${p.room}`} slug={p.room} />;
}
