import type { Config } from "tailwindcss";

// Palette lifted from the AI CoLab calendar (see appspec.md → Suggested visual identity)
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      // Colors reference CSS variables (RGB triples) so a room can re-theme at
      // runtime by overriding :root. Defaults live in app/globals.css.
      colors: {
        bg: "rgb(var(--c-bg) / <alpha-value>)",
        surface: "rgb(var(--c-surface) / <alpha-value>)",
        accent: "rgb(var(--c-accent) / <alpha-value>)",
        muted: "rgb(var(--c-muted) / <alpha-value>)",
        border: "rgb(var(--c-border) / <alpha-value>)",
      },
      fontFamily: {
        // Hanken Grotesk (via next/font) with a system fallback to avoid flash.
        sans: [
          "var(--font-sans)",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
        // Fraunces — editorial optical serif for display moments.
        display: ["var(--font-display)", "Georgia", "Cambria", "serif"],
      },
      keyframes: {
        pulseSoft: {
          "0%, 100%": { opacity: "0.4", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.06)" },
        },
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        riseIn: {
          "0%": { opacity: "0", transform: "translateY(14px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        // Diagonal sheen that sweeps a placeholder while AI is thinking.
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        // E2 — projector cross-dissolve between phases (paired in/out).
        crossFadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        crossFadeOut: {
          "0%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
        // E2 — a one-shot gentle "breath" on the projector NOW label when a phase begins.
        nowBreathe: {
          "0%": { opacity: "0.55", transform: "scale(0.99)" },
          "40%": { opacity: "1", transform: "scale(1.015)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        pulseSoft: "pulseSoft 2.4s ease-in-out infinite",
        fadeInUp: "fadeInUp 0.45s cubic-bezier(0.22, 1, 0.36, 1) both",
        riseIn: "riseIn 0.55s cubic-bezier(0.22, 1, 0.36, 1) both",
        shimmer: "shimmer 1.6s ease-in-out infinite",
        crossFadeIn: "crossFadeIn 0.28s cubic-bezier(0.22, 1, 0.36, 1) both",
        crossFadeOut: "crossFadeOut 0.28s cubic-bezier(0.22, 1, 0.36, 1) both",
        nowBreathe: "nowBreathe 0.9s cubic-bezier(0.22, 1, 0.36, 1) both",
      },
    },
  },
  plugins: [],
};

export default config;
