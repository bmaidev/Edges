import type { Metadata, Viewport } from "next";
import "./globals.css";
// W0/D2 — self-hosted fonts (vendored woff2, zero Google dependency at build or
// run). `readable` is the opt-in high-legibility a11y font (Atkinson); `display`
// + `sans` are the editorial serif + body grotesque. See lib/a11y/fonts.ts.
import { display, readable, sans } from "@/lib/a11y/fonts";

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
