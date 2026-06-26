import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, Fraunces, Hanken_Grotesk } from "next/font/google";
import "./globals.css";

// D2 — a high-legibility font participants can opt into (distinct letterforms,
// designed for low vision). Loaded as a CSS variable; only applied on the
// readable toggle.
const readable = Atkinson_Hyperlegible({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-readable",
  display: "swap",
});

// Refined editorial type: an optical serif for display moments + a warm, highly
// legible grotesque for body/UI. Distinctive, not the generic system stack.
const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});
const sans = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Edges — facilitation",
  description: "A calm, privacy-first companion for running great workshops.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0F1A35",
  width: "device-width",
  initialScale: 1,
  // Allow pinch-zoom (accessibility) — don't trap users at 1x.
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${readable.variable}`}>
      <body className="min-h-screen bg-bg text-white font-sans antialiased">
        {children}
        <div aria-hidden className="grain pointer-events-none fixed inset-0 z-0" />
      </body>
    </html>
  );
}
