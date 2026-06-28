import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Phase E2 — .env.example is the authoritative list of every env var the code
// reads. This guard scans the source for process.env.X and asserts each is
// documented, so the file can't silently drift out of date.

// Framework / runtime vars that aren't operator config (not in .env.example).
const ALLOWLIST = new Set(["NODE_ENV"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe(".env.example completeness", () => {
  it("documents every process.env.* the app reads", () => {
    const root = process.cwd();
    const files = [
      ...walk(join(root, "lib")),
      ...walk(join(root, "app")),
      ...walk(join(root, "components")),
    ];
    const used = new Set<string>();
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const m of Array.from(src.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g))) {
        if (!ALLOWLIST.has(m[1])) used.add(m[1]);
      }
    }

    const example = readFileSync(join(root, ".env.example"), "utf8");
    const undocumented = Array.from(used).filter((name) => !example.includes(name)).sort();
    expect(undocumented, `undocumented env vars in .env.example: ${undocumented.join(", ")}`).toEqual([]);
  });
});
