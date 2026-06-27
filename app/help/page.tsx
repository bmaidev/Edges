import { DocBody } from "@/components/DocBody";
import { MethodReference } from "@/components/MethodReference";

import overview from "@/docs/README.md";
import adminGuide from "@/docs/admin-guide.md";
import facilitatorGuide from "@/docs/facilitator-guide.md";
import rolesPasscodes from "@/docs/roles-and-passcodes.md";
import modules from "@/docs/modules.md";
import templates from "@/docs/templates.md";
import aiPrivacy from "@/docs/ai-and-privacy.md";

const DOCS: { slug: string; title: string; body: string }[] = [
  { slug: "overview", title: "Overview", body: overview },
  { slug: "admin-guide", title: "Admin guide", body: adminGuide },
  { slug: "facilitator-guide", title: "Facilitator guide", body: facilitatorGuide },
  { slug: "roles-and-passcodes", title: "Roles & passcodes", body: rolesPasscodes },
  { slug: "modules", title: "Module reference", body: modules },
  // B6 — a LIVE method reference (rendered from the real module cards, not markdown).
  { slug: "methods", title: "Methods (live)", body: "" },
  { slug: "templates", title: "Templates", body: templates },
  { slug: "ai-and-privacy", title: "AI & privacy", body: aiPrivacy },
];

// Server component: the active doc is chosen from the URL's ?doc= on the server,
// so the page fully server-renders its content (no loading flash, readable
// without JS). The markdown itself renders via the DocBody client component.
export default function HelpPage({
  searchParams,
}: {
  searchParams: { doc?: string };
}) {
  const slug = searchParams.doc ?? "overview";
  const active = DOCS.find((d) => d.slug === slug) ?? DOCS[0];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6 md:flex-row">
      <nav className="md:w-56 md:shrink-0">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Guides
        </p>
        <ul className="flex flex-wrap gap-2 md:flex-col md:gap-1">
          {DOCS.map((d) => (
            <li key={d.slug}>
              <a
                href={`/help?doc=${d.slug}`}
                className={`block rounded-lg px-3 py-2 text-sm ${
                  d.slug === active.slug
                    ? "bg-accent/15 text-accent"
                    : "text-muted hover:bg-surface hover:text-white/90"
                }`}
              >
                {d.title}
              </a>
            </li>
          ))}
        </ul>
        <a href="/admin" className="mt-4 block px-3 text-xs text-muted underline">
          ← Back to admin
        </a>
      </nav>
      <article className="min-w-0 flex-1">
        {active.slug === "methods" ? <MethodReference /> : <DocBody markdown={active.body} />}
      </article>
    </main>
  );
}
