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

    let registrationRef: ServiceWorkerRegistration | null = null;
    let newWorkerRef: ServiceWorker | null = null;

    // Store references to event listener functions for cleanup
    const onStateChange = () => {
      if (
        newWorkerRef?.state === "installed" &&
        navigator.serviceWorker.controller
      ) {
        setUpdateAvailable(true);
      }
    };

    const onUpdateFound = () => {
      const newWorker = registrationRef?.installing;
      if (!newWorker) return;

      newWorkerRef = newWorker;
      newWorker.addEventListener("statechange", onStateChange);
    };

    // Register the service worker
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        registrationRef = registration;
        setIsRegistered(true);

        // Check for updates periodically
        registration.addEventListener("updatefound", onUpdateFound);
      })
      .catch((error) => {
        logger.warn("Service worker registration failed: ", error);
      });

    // Cleanup function to remove event listeners
    return () => {
      if (registrationRef) {
        registrationRef.removeEventListener("updatefound", onUpdateFound);
      }
      if (newWorkerRef) {
        newWorkerRef.removeEventListener("statechange", onStateChange);
      }
    };
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
