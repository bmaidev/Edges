/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Privacy: no telemetry, no analytics. Don't log request bodies anywhere.
  poweredByHeader: false,
  // Defense-in-depth: never leak an admin URL (or any in-page super-admin code)
  // via the Referer header on the next outbound navigation. The wizard already
  // keeps the code out of the URL; this is belt-and-suspenders.
  async headers() {
    return [
      {
        source: "/admin/:path*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
      {
        source: "/admin",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
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
