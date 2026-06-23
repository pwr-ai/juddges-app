import path from 'path';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(
  readFileSync(path.join(__dirname, 'package.json'), 'utf8')
) as { version: string };

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
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
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
      '@radix-ui/react-accordion',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-collapsible',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-label',
      '@radix-ui/react-popover',
      '@radix-ui/react-progress',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-select',
      '@radix-ui/react-separator',
      '@radix-ui/react-slider',
      '@radix-ui/react-slot',
      '@radix-ui/react-switch',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toggle',
      '@radix-ui/react-tooltip',
      '@tiptap/react',
      '@tiptap/starter-kit',
      '@tiptap/extension-code-block-lowlight',
      '@tiptap/extension-color',
      '@tiptap/extension-image',
      '@tiptap/extension-link',
      '@tiptap/extension-placeholder',
      '@tiptap/extension-table',
      '@tiptap/extension-table-cell',
      '@tiptap/extension-table-header',
      '@tiptap/extension-table-row',
      '@tiptap/extension-text-align',
      '@tiptap/extension-text-style',
      '@tiptap/extension-underline',
      'framer-motion',
      'recharts',
      'date-fns',
      'react-markdown',
      'lowlight',
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
    // Cache optimized images for 24h to cut CDN/image-optimizer revalidation cost.
    minimumCacheTTL: 86400,
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
