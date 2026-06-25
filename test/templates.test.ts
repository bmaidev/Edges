import { describe, expect, it } from "vitest";
import { TEMPLATES } from "@/lib/templates";
import { SERVER_MODULES } from "@/lib/modules/registry.server";

// Every built-in template must be launchable: setPhases validates each phase's
// config against its module's zod schema and rejects the whole launch on the
// first failure. This guards against a template shipping a config that silently
// won't launch (which looks exactly like "the build isn't saving").
describe("built-in templates are launchable", () => {
  for (const t of TEMPLATES) {
    it(`${t.id}: every phase config satisfies its module schema`, () => {
      expect(t.phases.length).toBeGreaterThan(0);
      for (const p of t.phases) {
        const mod = SERVER_MODULES[p.moduleId];
        expect(mod, `unknown module ${p.moduleId}`).toBeTruthy();
        const r = mod.schema.safeParse(p.config);
        const why = r.success
          ? ""
          : `${r.error.issues[0]?.path.join(".")}: ${r.error.issues[0]?.message}`;
        expect(r.success, `${t.id}/${p.id} (${p.moduleId}) → ${why}`).toBe(true);
      }
    });
  }
});
