import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin the workspace root: this project may sit inside a directory tree that
  // has other lockfiles, and Turbopack would otherwise guess an ancestor.
  turbopack: { root: import.meta.dirname },
  // Dev-only. Next 16's dev server rejects `/_next/*` requests whose Origin is
  // not on this list with a 403, and `127.0.0.1` is not a default — which breaks
  // hydration silently (the page renders, nothing responds to a click).
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
};

export default nextConfig;
