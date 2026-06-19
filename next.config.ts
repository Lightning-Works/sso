import type { NextConfig } from "next";

// Allow Dreadroot / Siege / Lightningworks game clients to EMBED the wallet pages in an iframe.
// Scoped to /wallet/* so the rest of the SSO stays unframeable. CSP frame-ancestors is the modern
// replacement for X-Frame-Options. See (dreadroot) docs/WAX_SSO_HANDOFF.md.
const FRAME_ANCESTORS =
  "frame-ancestors 'self' https://dreadroot.com https://*.dreadroot.com https://*.pages.dev https://sw.lightningworks.io https://*.lightningworks.io";

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: "/wallet/:path*",
        headers: [{ key: "Content-Security-Policy", value: FRAME_ANCESTORS }],
      },
    ];
  },
};

export default nextConfig;
