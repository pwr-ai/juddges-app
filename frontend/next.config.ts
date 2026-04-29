import path from 'path';

/** @type {import('next').NextConfig} */
const baseConfig = {
  // Output standalone build optimized for Docker
  output: 'standalone',
  // Ensure tracing works correctly when multiple lockfiles exist in monorepo
  outputFileTracingRoot: path.join(__dirname, '..'),
  // Include repo-root release-notes/*.md so /changelog can read them at runtime
  // in standalone builds. Paths are relative to outputFileTracingRoot.
  outputFileTracingIncludes: {
    '/changelog': ['release-notes/**/*.md'],
    '/changelog/[version]': ['release-notes/**/*.md'],
    '/changelog/feed.xml': ['release-notes/**/*.md'],
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  experimental: {
    // reactCompiler disabled: causes "e[o] is undefined" chunk errors during
    // RSC navigation due to circular re-exports in the styled components barrel.
    // Re-enable once barrel is fully refactored into standalone modules.
    reactCompiler: false,
    serverActions: {
      bodySizeLimit: '2mb',
    },
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-icons',
    ],
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

// Wrap with Sentry only when the package is installed and DSN is configured.
// This keeps the build working in environments without @sentry/nextjs.
let nextConfig = baseConfig;

if (process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { withSentryConfig } = require('@sentry/nextjs');
    nextConfig = withSentryConfig(baseConfig, {
      // Suppresses Sentry CLI telemetry during build.
      silent: true,
      // Automatically tree-shake Sentry logger statements to reduce bundle size.
      disableLogger: true,
      // Upload source maps to Sentry for readable stack traces in production.
      // Requires SENTRY_AUTH_TOKEN env var (optional — skips upload if unset).
      authToken: process.env.SENTRY_AUTH_TOKEN,
    });
  } catch {
    // @sentry/nextjs not installed — skip wrapping, Sentry stays disabled.
  }
}

export default nextConfig;
