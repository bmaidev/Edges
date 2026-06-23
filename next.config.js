/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Privacy: no telemetry, no analytics. Don't log request bodies anywhere.
  poweredByHeader: false,
  // Import docs/*.md as raw strings so the in-app /help page renders the SAME
  // files as the repo docs (single source of truth, bundled at build time).
  webpack(config) {
    config.module.rules.push({ test: /\.md$/, type: "asset/source" });
    return config;
  },
};

module.exports = nextConfig;
