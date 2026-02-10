"use client";

import { useServiceWorker } from "@/hooks/useServiceWorker";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { OfflineIndicator } from "@/components/OfflineIndicator";

export function PWAProvider() {
  useServiceWorker();

  return (
    <>
      <PWAInstallPrompt />
      <OfflineIndicator />
    </>
  );
}
