/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Phase E — a self-contained server bundle (Next traces deps into
  // .next/standalone) so the Docker image is small and `node server.js` runs the
  // whole app. No effect on the Vercel deploy.
  output: "standalone",
  // Privacy: no telemetry, no analytics. Don't log request bodies anywhere.
  poweredByHeader: false,
  // Defense-in-depth: never leak an admin URL (or any in-page super-admin code)
  // via the Referer header on the next outbound navigation. The wizard already
  // keeps the code out of the URL; this is belt-and-suspenders.
  async headers() {
    const scriptSrc = ["'self'", "'unsafe-inline'"];
    if (process.env.NODE_ENV !== "production") scriptSrc.push("'unsafe-eval'");
    const csp = [
      "default-src 'self'",
      `script-src ${scriptSrc.join(" ")}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",
      "worker-src 'self' blob:",
      "frame-src https://www.youtube.com https://player.vimeo.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ");
    const securityHeaders = [
      { key: "Content-Security-Policy", value: csp },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      {
        key: "Permissions-Policy",
        value: "camera=(), geolocation=(), payment=(), usb=(), microphone=(self)",
      },
      ...(process.env.NODE_ENV === "production"
        ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
        : []),
    ];
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  // Import docs/*.md as raw strings so the in-app /help page renders the SAME
  // files as the repo docs (single source of truth, bundled at build time).
  webpack(config) {
    config.module.rules.push({ test: /\.md$/, type: "asset/source" });
    return config;
  },
};

module.exports = nextConfig;
