import path from 'node:path';
import type { NextConfig } from 'next';

// Monorepo root, so Next traces workspace packages (e.g. @sd/shared) correctly.
const repoRoot = path.join(__dirname, '..', '..');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
};

export default nextConfig;
