import React from "react";
import "@/app/globals.css";
import localFont from "next/font/local";
import { Instrument_Serif } from "next/font/google";
import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/contexts/AuthContext";
import { BrandProvider } from "@/contexts/BrandContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { QueryProvider } from "@/app/providers";
import { AppLayoutWrapper } from "@/components/layouts/AppLayoutWrapper";
import { ChunkErrorBoundary } from "@/components/ChunkErrorBoundary";
import { SonnerToaster } from "@/lib/styles/components";
import { getBrandConfig, getCurrentBrand } from "@/lib/brand";

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
  variable: "--font-instrument-serif",
});

const fallbackSiteUrl = "https://juddges.com";
const configuredSiteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.VERCEL_PROJECT_PRODUCTION_URL ||
  process.env.VERCEL_URL ||
  fallbackSiteUrl;

const metadataBase = (() => {
  try {
    const url = configuredSiteUrl.startsWith("http")
      ? configuredSiteUrl
      : `https://${configuredSiteUrl}`;
    return new URL(url);
  } catch {
    return new URL(fallbackSiteUrl);
  }
})();

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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1a2e" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: brandConfig.name,
  description: brandConfig.tagline,
  metadataBase,
  icons: {
    icon: brandConfig.logo || '/icon.svg?v=2',
    apple: brandConfig.logo || '/apple-icon.svg?v=2',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: brandConfig.shortName,
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

  // Use suppressHydrationWarning to prevent hydration errors
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth" data-brand={currentBrand}>
      <head>
        {/*
          Global Chunk Error Handler
          
          Runs before React to catch chunk loading errors at the global level.
          Provides automatic recovery by reloading the page when chunk errors occur.
          Note: No 'async' attribute - must load synchronously to catch early errors.
        */}
        <script src="/chunk-error-handler.js" async />
        
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
      <body className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} font-sans antialiased`} suppressHydrationWarning>
        <ChunkErrorBoundary>
          <QueryProvider>
            <AuthProvider>
              <BrandProvider>
                <LanguageProvider>
                  <ThemeProvider
                    attribute="class"
                    defaultTheme="system"
                    enableSystem
                    disableTransitionOnChange
                  >
                    <AppLayoutWrapper>
                      {children}
                    </AppLayoutWrapper>
                    <SonnerToaster />
                  </ThemeProvider>
                </LanguageProvider>
              </BrandProvider>
            </AuthProvider>
          </QueryProvider>
        </ChunkErrorBoundary>
      </body>
    </html>
  );
}
