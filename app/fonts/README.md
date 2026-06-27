# Vendored fonts (self-hosted)

W0/D2 — these woff2 files are vendored so the app has **zero Google Fonts
dependency** at build or runtime (previously loaded via `next/font/google`,
which fetches from Google's servers at build time). Wired up in
`lib/a11y/fonts.ts` via `next/font/local`.

All three families are licensed under the **SIL Open Font License 1.1**, which
permits bundling and redistribution. Files are the `latin` subset (matching the
prior `subsets: ["latin"]`).

| File | Family | Weight | Upstream |
|---|---|---|---|
| `atkinson-400.woff2` / `atkinson-700.woff2` | Atkinson Hyperlegible | 400, 700 | Braille Institute — https://github.com/googlefonts/atkinson-hyperlegible |
| `fraunces-var.woff2` | Fraunces | variable 100–900 | Undercase — https://github.com/undercasetype/Fraunces |
| `hanken-var.woff2` | Hanken Grotesk | variable 100–900 | Hanken Design Co. — https://github.com/hanken-design/HKGrotesk |

OFL 1.1: https://openfontlicense.org — these fonts remain under the OFL; the
license is not revoked by bundling. To refresh, re-pull the `latin`-subset woff2
from the Google Fonts `css2` API for the same family/axes.
