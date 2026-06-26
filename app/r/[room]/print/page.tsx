"use client";

import { useEffect, useRef, useState } from "react";

// B3 — the printable facilitator run-sheet. The host console hands the data over
// via localStorage (read-once-then-clear), so the PRIVATE notes never hit a URL
// or the server — they stay in the facilitator's own browser. Auto-prints.
interface PrintPhase {
  n: number;
  label: string;
  minutes: number;
  script?: string;
  talkingPoints?: string;
  contingency?: string;
}
interface PrintPayload {
  sessionName: string | null;
  totalMinutes: number;
  phases: PrintPhase[];
}

export default function PrintPage() {
  const [data, setData] = useState<PrintPayload | null>(null);
  const [empty, setEmpty] = useState(false);
  // Read-once guard: the effect consumes (reads + clears) localStorage, so React
  // StrictMode's dev double-invoke must not run it twice (the second pass would
  // find nothing and flip to the empty state, hiding a real payload).
  const consumed = useRef(false);

  useEffect(() => {
    if (consumed.current) return;
    consumed.current = true;
    try {
      const raw = localStorage.getItem("edges_print");
      if (raw) {
        setData(JSON.parse(raw));
        localStorage.removeItem("edges_print"); // read once
      } else {
        setEmpty(true);
      }
    } catch {
      setEmpty(true);
    }
  }, []);

  useEffect(() => {
    if (data) {
      const t = window.setTimeout(() => window.print(), 400);
      return () => window.clearTimeout(t);
    }
  }, [data]);

  if (empty)
    return (
      <main className="flex min-h-screen items-center justify-center bg-white p-8 text-center text-[#555]">
        <p className="max-w-sm">
          Open the run-sheet from the host console&apos;s Session tab.
        </p>
      </main>
    );
  if (!data) return null;

  return (
    <main
      className="mx-auto max-w-3xl bg-white px-10 py-8 text-[#1a1a1a]"
      style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
    >
      <header className="border-b pb-3" style={{ borderColor: "#ddd" }}>
        <h1 className="text-2xl font-semibold">{data.sessionName || "Run-sheet"}</h1>
        <p className="text-sm text-[#666]">
          {data.phases.length} phases · ~{data.totalMinutes} minutes · facilitator run-sheet
        </p>
      </header>
      <ol className="mt-4 flex flex-col gap-4">
        {data.phases.map((p) => (
          <li key={p.n} className="break-inside-avoid border-b pb-3" style={{ borderColor: "#eee" }}>
            <div className="flex items-baseline justify-between">
              <p className="font-semibold">
                {p.n}. {p.label}
              </p>
              <span className="text-sm text-[#888]">~{p.minutes} min</span>
            </div>
            {p.script && <p className="mt-1 leading-relaxed">{p.script}</p>}
            {p.talkingPoints && (
              <p className="mt-1 whitespace-pre-line text-sm text-[#444]">{p.talkingPoints}</p>
            )}
            {p.contingency && (
              <p className="mt-1 text-sm text-[#666]">
                <em>If it goes quiet:</em> {p.contingency}
              </p>
            )}
          </li>
        ))}
      </ol>
    </main>
  );
}
