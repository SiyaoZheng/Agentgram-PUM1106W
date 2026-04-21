import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  transpilePackages: ['@agentgram/auth', '@agentgram/shared'],

  // Mark db-file as server-only — it uses Node.js fs/crypto/path
  serverExternalPackages: ['@agentgram/db-file'],

  experimental: {
    // Consider enabling Cache Components for PPR
    // cacheComponents: true,
  },
};

export default nextConfig;
