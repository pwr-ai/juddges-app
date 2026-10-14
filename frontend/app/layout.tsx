import React from "react";
import "@/app/globals.css";
import localFont from "next/font/local";
import { Tenor_Sans } from "next/font/google";
import type { Metadata, Viewport } from "next";

import { AuthProvider } from "@/contexts/AuthContext";
import { BrandProvider } from "@/contexts/BrandContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { QueryProvider } from "@/app/providers";
import { AppLayoutWrapper } from "@/components/layouts/AppLayoutWrapper";
import { ChunkErrorBoundary } from "@/components/ChunkErrorBoundary";
import { SonnerToaster } from "@/lib/styles/components";
import { getBrandConfig, getCurrentBrand } from "@/lib/brand";
import { siteMetadataBase } from "@/lib/site";
import { JsonLd } from "@/components/JsonLd";
import { getSiteStructuredData } from "@/lib/structured-data";
import { CollectionDetailProvider } from "@/contexts/CollectionDetailContext";
import { getPublicRuntimeEnv, serializeForInlineScript } from "@/lib/env/server";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});
// Display face: Tenor Sans is the open substitute for Zapf Humanist / Optima,
// the PWr identity typeface (SIW 2025-12). Single weight, no italic.
const tenorSans = Tenor_Sans({
  subsets: ["latin", "latin-ext"],
  weight: "400",
  display: "swap", // Avoid invisible text (FOIT) while the display face loads
  variable: "--font-tenor-sans",
});

// Get brand configuration at build/render time
const currentBrand = getCurrentBrand();
const brandConfig = getBrandConfig();

// Baseline for window.__env. Read through computed lookups (lib/env/server)
// so nothing here is frozen at build time; for statically prerendered pages
// this still reflects the build machine, which is why /runtime-env.js below
// re-applies the running container's values on top.
const runtimeConfigValues = {
  ...getPublicRuntimeEnv(),
  NEXT_PUBLIC_BRAND: currentBrand,
};

// No maximumScale / userScalable here on purpose: locking the scale breaks
// pinch-zoom app-wide and violates WCAG 2.1 SC 1.4.4 (Resize Text). iOS
// focus-zoom is prevented by the >=16px form-control rule in globals.css.
export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: siteMetadataBase,
  title: {
    default: brandConfig.metadata.title,
    template: `%s · ${brandConfig.name}`,
  },
  description: brandConfig.metadata.description,
  applicationName: brandConfig.name,
  keywords: [
    "judicial decisions",
    "court judgments",
    "case law search",
    "Polish court judgments",
    "UK court judgments",
    "legal AI",
    "semantic search",
    "legal research",
    "NLP",
    "Juddges",
  ],
  authors: [{ name: brandConfig.copyrightHolder }],
  creator: brandConfig.copyrightHolder,
  publisher: brandConfig.copyrightHolder,
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: brandConfig.logo || '/icon.svg?v=2',
    apple: brandConfig.logo || '/apple-icon.svg?v=2',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: brandConfig.shortName,
  },
  openGraph: {
    type: "website",
    siteName: brandConfig.name,
    title: brandConfig.metadata.ogTitle,
    description: brandConfig.metadata.description,
    url: "/",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: brandConfig.metadata.ogTitle,
    description: brandConfig.metadata.description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Inline runtime configuration - injected directly into HTML
  // This ensures window.__env is available before any React code runs
  const runtimeConfig = `
    (function() {
      const config = ${serializeForInlineScript(runtimeConfigValues)};
      window.__env = Object.assign({}, window.__env || {}, config);
    })();
  `;

  return (
    // The next/font `.variable` classes must sit on <html>, not <body>. They are
    // what declares --font-geist-sans / --font-geist-mono / --font-tenor-sans,
    // and the design tokens in globals.css (--font-sans, --font-display,
    // --font-serif, --font-mono) are declared on :root and reference them. A
    // custom property that references an undefined variable is invalid at
    // computed-value time, so with these classes one level below :root every
    // token computed to nothing and the whole app silently fell back to the
    // system font stack. The trailing families inside each token (Optima,
    // system-ui, Georgia) do not rescue it — the entire value is invalidated,
    // not a single family.
    <html
      lang="en"
      data-scroll-behavior="smooth"
      data-brand={currentBrand}
      className={`${geistSans.variable} ${geistMono.variable} ${tenorSans.variable}`}
    >
      <head>
        {/*
          Global Chunk Error Handler

          Runs before React to catch chunk loading errors at the global level.
          Provides automatic recovery by reloading the page when chunk errors occur.
          Note: No 'async' attribute - must load synchronously to catch early errors.
        */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/chunk-error-handler.js" />

        {/*
          Runtime Environment Configuration (two layers, both before React)

          1. Inline baseline: values known when this HTML was rendered. For a
             dynamic page that is the live server env; for a statically
             prerendered page it is whatever the *build* had, possibly empty.
          2. /runtime-env.js: a force-dynamic route handler that serves the
             running container's env and merges it into window.__env. Loaded
             synchronously so lib/env/client.ts sees final values at module
             evaluation. This is what makes the Docker image reconfigurable
             without a rebuild.
        */}
        <script
          dangerouslySetInnerHTML={{ __html: runtimeConfig }}
        />
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/runtime-env.js" />
      </head>
      <body className="font-sans antialiased">
        <JsonLd data={getSiteStructuredData()} />
        <ChunkErrorBoundary>
          <QueryProvider>
            <AuthProvider>
              <BrandProvider>
                <LanguageProvider>
                  <CollectionDetailProvider>
                    <AppLayoutWrapper>
                      {children}
                    </AppLayoutWrapper>
                  </CollectionDetailProvider>
                    <SonnerToaster />
                </LanguageProvider>
              </BrandProvider>
            </AuthProvider>
          </QueryProvider>
        </ChunkErrorBoundary>
      </body>
    </html>
  );
}
