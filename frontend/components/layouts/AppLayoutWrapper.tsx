"use client";

import React, { useEffect, useState, Suspense } from "react";
import { usePathname } from "next/navigation";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ChatProvider } from "@/contexts/ChatContext";
import { AppSidebar } from "@/components/app-sidebar";
import { Navbar } from "@/components/navbar";
import { CompactFooter } from "@/components/footer/CompactFooter";
import { CommandPalette } from "@/components/command-palette";
import { LegalComplianceWrapper } from "@/components/legal/legal-compliance-wrapper";
import { CommandPaletteProvider } from "@/contexts/CommandPaletteContext";
import { PWAProvider } from "@/components/PWAProvider";

export function AppLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDebugPage = pathname?.includes("/extractions/debug");

  // Pages that should use icon-only sidebar (expand on hover)
  // TEMPORARILY DISABLED: Icon mode disabled for the whole application
  const iconOnlyPages = [
    "/documents/",
    "/extractions/",
    "/extract",
    "/schemas/",
    "/schema-chat",
  ];

  // Temporarily disable icon mode for the whole application
  const shouldUseIconOnly = false; // iconOnlyPages.some((page) => pathname?.startsWith(page));

  const [isSearchLoading, setIsSearchLoading] = useState(false);

  // Check if body has search-loading class
  useEffect(() => {
    const checkSearchLoading = () => {
      setIsSearchLoading(document.body.classList.contains('search-loading'));
    };

    // Check initially
    checkSearchLoading();

    // Watch for changes using MutationObserver
    const observer = new MutationObserver(checkSearchLoading);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => observer.disconnect();
  }, []);

  // Don't show sidebar/navbar for auth pages, style-demo, debug routes, and admin
  const isAuthPage = pathname?.startsWith("/auth");
  const isStyleDemoPage = pathname?.startsWith("/style-demo");
  const isAdminPage = pathname?.startsWith("/admin");

  if (isAuthPage || isStyleDemoPage || isDebugPage || isAdminPage) {
    return <>{children}</>;
  }

  // Navbar wrapped in Suspense to handle useSearchParams()
  const NavbarWithSuspense = () => (
    <Suspense fallback={
      <header className="flex items-center justify-between px-4 md:px-8 h-16 min-h-[4rem] bg-background sticky top-0 z-30">
        <div className="flex items-center gap-3 md:gap-5">
          <div className="w-9 h-9 rounded-lg bg-muted/50 animate-pulse" />
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          <div className="w-20 h-10 bg-muted/50 rounded animate-pulse" />
        </div>
      </header>
    }>
      <Navbar />
    </Suspense>
  );

  // No loading gate here, deliberately. This used to return a full-screen
  // "Initializing application" panel while `isInitialLoad || authLoading` was
  // true. Both start true and only clear inside effects, which never run during
  // SSR — so the server rendered that panel for *every* route, on every
  // request. The served HTML carried ~146 characters of visible text and no
  // page content at all, including on static pages like /about. See #481.
  //
  // This gate was never an access boundary: middleware.ts decides server-side
  // whether a request may see a route and redirects anonymous users to
  // /auth/login before this component renders. Dropping it exposes nothing that
  // was not already authorised. Auth-dependent chrome (the user menu) handles
  // its own pending state, so it does not need the whole page held back.
  //
  // Show sidebar, navbar, and command palette for all other pages
  return (
    <CommandPaletteProvider>
      <SidebarProvider defaultOpen={!shouldUseIconOnly}>
        <ChatProvider initialMaxDocuments={10}>
          <LegalComplianceWrapper>
            <div className="flex flex-col h-screen w-full overflow-hidden">
              {/* Main content area: sidebar + content */}
              <div className="flex flex-1 overflow-hidden">
                <AppSidebar />
                <div className="flex-1 flex flex-col bg-background overflow-hidden">
                  <NavbarWithSuspense />
                  <div className="flex-1 overflow-y-auto">
                    <main className="bg-background">
                      {children}
                    </main>
                  </div>
                </div>
              </div>
              {/* Compact footer at bottom, outside scroll area */}
              <CompactFooter />
            </div>
            {/* Command Palette - Available globally via Cmd/Ctrl+K */}
            <CommandPalette />
            {/* PWA: Service worker registration + install prompt */}
            <PWAProvider />
          </LegalComplianceWrapper>
        </ChatProvider>
      </SidebarProvider>
    </CommandPaletteProvider>
  );
}
