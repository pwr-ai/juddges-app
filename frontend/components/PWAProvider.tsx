"use client";

import { useServiceWorker } from "@/hooks/useServiceWorker";

export function PWAProvider() {
  useServiceWorker();

  return null;
}
