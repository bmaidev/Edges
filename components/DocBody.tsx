"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

// Renders a markdown string in the app's dark theme. Content is passed in as a
// prop (chosen server-side), so this client component still server-renders its
// output — no loading flash, content present without JS. Internal doc links
// like "facilitator-guide.md" are rewritten to /help?doc=… to stay in-app.
const MD: Components = {
  h1: (p) => <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight text-white" {...p} />,
  h2: (p) => <h2 className="font-display mt-7 border-t border-border pt-4 text-2xl font-semibold text-white" {...p} />,
  h3: (p) => <h3 className="mt-4 text-lg font-semibold text-white/90" {...p} />,
  p: (p) => <p className="mt-2 leading-relaxed text-white/85" {...p} />,
  ul: (p) => <ul className="mt-2 ml-5 list-disc space-y-1 text-white/85" {...p} />,
  ol: (p) => <ol className="mt-2 ml-5 list-decimal space-y-1 text-white/85" {...p} />,
  li: (p) => <li className="leading-relaxed" {...p} />,
  strong: (p) => <strong className="font-semibold text-white" {...p} />,
  blockquote: (p) => (
    <blockquote className="mt-3 border-l-2 border-accent bg-surface/50 px-4 py-2 text-sm text-muted" {...p} />
  ),
  code: (p) => (
    <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[0.85em] text-accent" {...p} />
  ),
  pre: (p) => (
    <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-surface p-3 text-xs" {...p} />
  ),
  a: ({ href, ...rest }) => {
    let to = href ?? "#";
    const m = /^([a-z0-9-]+)\.md(#.*)?$/i.exec(to);
    if (m) to = `/help?doc=${m[1]}`;
    else if (to === "README.md") to = "/help?doc=overview";
    const external = /^https?:\/\//.test(to);
    return (
      <a
        href={to}
        className="text-accent underline"
        {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
        {...rest}
      />
    );
  },
  table: (p) => (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...p} />
    </div>
  ),
  th: (p) => <th className="border border-border bg-surface px-3 py-2 text-left font-semibold" {...p} />,
  td: (p) => <td className="border border-border px-3 py-2 align-top text-white/85" {...p} />,
  hr: () => <hr className="my-6 border-border" />,
};

export function DocBody({ markdown }: { markdown: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>
      {markdown}
    </ReactMarkdown>
  );
}
