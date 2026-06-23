import React from "react";
import "@/app/globals.css";
import localFont from "next/font/local";
import { Instrument_Serif } from "next/font/google";
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
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  display: "swap", // Avoid invisible text (FOIT) while the serif loads
  variable: "--font-instrument-serif",
  preload: false, // Only used on admin and landing pages, not globally
});

// Get brand configuration at build/render time
const currentBrand = getCurrentBrand();
const brandConfig = getBrandConfig();

const runtimeConfigValues = {
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || "",
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  NEXT_PUBLIC_BRAND: currentBrand,
};

const serializeForInlineScript = (value: Record<string, string>) =>
  JSON.stringify(value)
    .replace(/</g, "\\u003C")
    .replace(/>/g, "\\u003E")
    .replace(/&/g, "\\u0026")
    .replace(/'/g, "\\u0027");

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
    <html lang="en" data-scroll-behavior="smooth" data-brand={currentBrand}>
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
          Runtime Environment Configuration

          Strategy: Inline script injection for immediate availability

          - Server-side: process.env.NEXT_PUBLIC_* values are injected at render time
          - Client-side: window.__env is available before React hydration
          - Benefit: No external file loading, no timing issues
        */}
        <script
          dangerouslySetInnerHTML={{ __html: runtimeConfig }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} font-sans antialiased`}>
        <JsonLd data={getSiteStructuredData()} />
        <ChunkErrorBoundary>
          <QueryProvider>
            <AuthProvider>
              <BrandProvider>
                <LanguageProvider>
                    <AppLayoutWrapper>
                      {children}
                    </AppLayoutWrapper>
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
