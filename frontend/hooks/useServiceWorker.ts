"use client";

import { useEffect, useState } from "react";
import { logger } from "@/lib/logger";

export function useServiceWorker() {
  const [isRegistered, setIsRegistered] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    // Register the service worker
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        setIsRegistered(true);

        // Check for updates periodically
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              setUpdateAvailable(true);
            }
          });
        });
      })
      .catch((error) => {
        logger.warn("Service worker registration failed: ", error);
      });
  }, []);

  const applyUpdate = () => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then((registration) => {
        registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
        window.location.reload();
      });
    }
  };

  return { isRegistered, updateAvailable, applyUpdate };
}
