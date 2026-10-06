import path from 'node:path';
import type { NextConfig } from 'next';

// Monorepo root, so Next traces workspace packages (e.g. @sd/shared) correctly.
const repoRoot = path.join(__dirname, '..', '..');

// Express API that /api/* is proxied to (server-side; never exposed to the browser).
const apiUrl = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // E2E builds use their own output folder so they never overwrite the dev build.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
  // Chat turns stream for up to a minute or more; the /api rewrite proxy must not
  // cut them off (default 30 s), which would drop the SSE mid-answer.
  experimental: { proxyTimeout: 300_000 },
  // Same-origin API: the browser calls /api/*, so the session cookie is
  // first-party and no CORS is needed between web and api.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
};

export default nextConfig;
