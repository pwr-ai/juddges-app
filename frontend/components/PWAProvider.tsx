"use client";

import { useServiceWorker } from "@/hooks/useServiceWorker";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";

export function PWAProvider() {
  useServiceWorker();

  return (
    <>
      <PWAInstallPrompt />
    </>
  );
}
