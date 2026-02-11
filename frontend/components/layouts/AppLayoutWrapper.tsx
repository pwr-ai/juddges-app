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
import { LoadingIndicator } from "@/lib/styles/components/loading-indicator";
import { useAuth } from "@/contexts/AuthContext";
import { JuddgesLogo } from "@/lib/styles/components/juddges-logo";
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
  
  // Always call useAuth (hooks must be called unconditionally)
  // But for debug pages, we'll ignore the loading state
  let authLoading = false;
  try {
    const auth = useAuth();
    authLoading = isDebugPage ? false : auth.loading;
  } catch (error) {
    // If useAuth fails (e.g., AuthProvider not available), treat as not loading
    console.warn("[AppLayoutWrapper] Auth not available, skipping auth check");
    authLoading = false;
  }
  
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // For debug pages, skip initial load immediately
  useEffect(() => {
    if (isDebugPage) {
      setIsInitialLoad(false);
    }
  }, [isDebugPage]);

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

  // Track initial load state - hide loading once auth is ready
  useEffect(() => {
    if (!authLoading && !isDebugPage) {
      // Small delay to ensure smooth transition
      const timer = setTimeout(() => {
        setIsInitialLoad(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [authLoading, isDebugPage]);

  // Don't show sidebar/navbar for auth pages, style-demo, debug routes, and enterprise
  const isAuthPage = pathname?.startsWith("/auth");
  const isStyleDemoPage = pathname?.startsWith("/style-demo");
  const isEnterprisePage = pathname === "/enterprise";

  if (isAuthPage || isStyleDemoPage || isDebugPage || isEnterprisePage) {
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

  // Show sidebar skeleton with loading indicator during initial app load
  // Skip loading check for debug pages
  if (!isDebugPage && (isInitialLoad || authLoading)) {
    return (
      <CommandPaletteProvider>
        <SidebarProvider defaultOpen={!shouldUseIconOnly}>
          <ChatProvider initialMaxDocuments={10}>
            <div className="flex min-h-screen w-full">
              <AppSidebar />
              <div className="flex-1 flex flex-col bg-background">
                <NavbarWithSuspense />
                <div className="flex-1 overflow-y-auto flex items-center justify-center">
                <LoadingIndicator
                  message="Initializing application and preparing your workspace"
                  logo={<JuddgesLogo size="lg" showText={true} showGlow={true} />}
                  showLoader={false}
                  variant="centered"
                  size="lg"
                />
                </div>
              </div>
            </div>
          </ChatProvider>
        </SidebarProvider>
      </CommandPaletteProvider>
    );
  }

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
