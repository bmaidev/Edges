"use client";

import { use } from "react";
import { BuilderApp } from "@/components/BuilderApp";
import { A11yProvider } from "@/components/A11yProvider";

export default function BuildPage({
  params,
}: {
  params: Promise<{ room: string }>;
}) {
  const p = use(params);
  return (
    <A11yProvider>
      <BuilderApp apiBase={`/api/r/${p.room}`} slug={p.room} />
    </A11yProvider>
  );
}
