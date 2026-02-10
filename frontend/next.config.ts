import path from 'path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // In Next.js 15, publicRuntimeConfig is the recommended approach
  // for environment variables that need to be available at runtime
  publicRuntimeConfig: {
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
  // Private environment variables (server-side only)
  serverRuntimeConfig: {
    BACKEND_API_KEY: process.env.BACKEND_API_KEY,
    API_BASE_URL: process.env.API_BASE_URL,
  },
  // Output standalone build optimized for Docker
  output: 'standalone',
  // Ensure tracing works correctly when multiple lockfiles exist in monorepo
  outputFileTracingRoot: path.join(__dirname, '..'),
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  // Ensure environment variables are properly transferred to the client
  experimental: {
    // Enable features compatible with Next.js 15
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  // Production optimizations
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
  // Note: swcMinify is removed as it's deprecated in Next.js 15
  // SWC minification is now enabled by default
  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
    ],
  },
  // Compiler optimizations
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },
  // PWA: Ensure service worker is served with correct headers
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
