import localFont from "next/font/local";

// W0/D2 — self-hosted fonts. We previously loaded these via next/font/google,
// which self-hosts at build but still fetches from Google's servers at BUILD
// time (an offline/build-dependency + a Google touch the privacy-first ethos
// would rather avoid). The latin woff2 files now live in app/fonts/ and are
// served straight from our own origin — zero Google dependency at build OR run.
//
// All three are SIL Open Font License, so vendoring is permitted. Subset to the
// latin block (matching the previous `subsets: ["latin"]`).

// Atkinson Hyperlegible — the high-legibility a11y font (opt-in "readable"
// toggle). Distinct letterforms designed for low vision. 400 + 700.
export const readable = localFont({
  src: [
    { path: "../../app/fonts/atkinson-400.woff2", weight: "400", style: "normal" },
    { path: "../../app/fonts/atkinson-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-readable",
  display: "swap",
});

// Fraunces — the optical display serif (variable weight). One variable file
// covers the full 100–900 range used across display moments.
export const display = localFont({
  src: "../../app/fonts/fraunces-var.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-display",
  display: "swap",
});

// Hanken Grotesk — the warm, highly legible body/UI grotesque (variable weight).
export const sans = localFont({
  src: "../../app/fonts/hanken-var.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-sans",
  display: "swap",
});
