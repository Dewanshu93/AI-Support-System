import path from 'node:path';
import type { NextConfig } from 'next';

// Monorepo root, so Next traces workspace packages (e.g. @sd/shared) correctly.
const repoRoot = path.join(__dirname, '..', '..');

// Express API that /api/* is proxied to (server-side; never exposed to the browser).
const apiUrl = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
  // Same-origin API: the browser calls /api/*, so the session cookie is
  // first-party and no CORS is needed between web and api.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
};

export default nextConfig;
