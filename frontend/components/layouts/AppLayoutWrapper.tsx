"use client";

import React, { useEffect, useState, Suspense } from "react";
import { usePathname } from "next/navigation";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ChatProvider } from "@/contexts/ChatContext";
import { AppSidebar } from "@/components/app-sidebar";
import { FlowStepper } from "@/components/editorial/FlowStepper";
import { Navbar } from "@/components/navbar";
import { CompactFooter } from "@/components/footer/CompactFooter";
import { CommandPalette } from "@/components/command-palette";
import { LegalComplianceWrapper } from "@/components/legal/legal-compliance-wrapper";
import { CommandPaletteProvider } from "@/contexts/CommandPaletteContext";
import { PWAProvider } from "@/components/PWAProvider";

// Navbar wrapped in Suspense to handle useSearchParams().
//
// Declared at module scope: defining it inside the layout's render gave it a
// new identity on every render, so React tore down and rebuilt the whole
// Suspense subtree instead of updating it. It closes over nothing, so there is
// nothing to pass in.
function NavbarWithSuspense() {
  return (
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
}

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
                    <FlowStepper />
                    <main className="bg-background">
                      {children}
                    </main>
                  </div>
                  {/* Footer sits inside the content column, below the scroll
                      area. It must not be a sibling of the sidebar row: the
                      sidebar reserves its width with an in-flow `sidebar-gap`
                      element scoped to that row, while the visible sidebar is a
                      `fixed inset-y-0 z-50` overlay spanning the full viewport
                      height. A footer outside the row gets no gap to push it
                      right, so the overlay painted over its left edge and
                      clipped the copyright line. */}
                  <CompactFooter />
                </div>
              </div>
            </div>
            {/* Command Palette - Available globally via Cmd/Ctrl+K */}
            <CommandPalette />
            {/* PWA: Service worker registration */}
            <PWAProvider />
          </LegalComplianceWrapper>
        </ChatProvider>
      </SidebarProvider>
    </CommandPaletteProvider>
  );
}
