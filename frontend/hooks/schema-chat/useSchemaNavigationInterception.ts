import { useCallback, useEffect, useRef, useState } from "react";

interface RouterLike {
  push: (href: string, options?: { scroll?: boolean }) => void;
  replace: (href: string, options?: { scroll?: boolean }) => void;
  back: () => void;
}

interface UseSchemaNavigationInterceptionParams {
  isDirty: boolean;
  router: RouterLike;
  pathname: string;
}

interface UseSchemaNavigationInterceptionResult {
  showNavigationDialog: boolean;
  setShowNavigationDialog: (open: boolean) => void;
  pendingNavigationUrl: string | null;
  confirmNavigation: () => void;
  cancelNavigation: () => void;
}

export function useSchemaNavigationInterception({
  isDirty,
  router,
  pathname,
}: UseSchemaNavigationInterceptionParams): UseSchemaNavigationInterceptionResult {
  const [showNavigationDialog, setShowNavigationDialog] = useState(false);
  const [pendingNavigationUrl, setPendingNavigationUrl] = useState<string | null>(
    null
  );

  const originalRouterMethodsRef = useRef<RouterLike | null>(null);

  useEffect(() => {
    if (!originalRouterMethodsRef.current) {
      originalRouterMethodsRef.current = {
        push: router.push,
        replace: router.replace,
        back: router.back,
      };
    }
  }, [router]);

  useEffect(() => {
    if (!isDirty) {
      return;
    }

    const handleLinkClick = (e: MouseEvent): void => {
      const target = e.target as HTMLElement;
      const link = target.closest("a[href]") as HTMLAnchorElement;

      if (!link) {
        return;
      }

      const href = link.getAttribute("href");
      if (!href) {
        return;
      }

      if (
        href === pathname ||
        href.startsWith("http") ||
        href.startsWith("mailto: ") ||
        href.startsWith("#")
      ) {
        return;
      }

      if (link.hasAttribute("download")) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      setPendingNavigationUrl(href);
      setShowNavigationDialog(true);
    };

    const originalPush = router.push;
    const originalReplace = router.replace;
    const originalBack = router.back;

    originalRouterMethodsRef.current = {
      push: originalPush,
      replace: originalReplace,
      back: originalBack,
    };

    const interceptedPush = (
      href: string,
      options?: { scroll?: boolean }
    ): void => {
      if (href !== pathname && isDirty) {
        setPendingNavigationUrl(href);
        setShowNavigationDialog(true);
        return;
      }

      return originalPush(href, options);
    };

    const interceptedReplace = (
      href: string,
      options?: { scroll?: boolean }
    ): void => {
      if (href !== pathname && isDirty) {
        setPendingNavigationUrl(href);
        setShowNavigationDialog(true);
        return;
      }

      return originalReplace(href, options);
    };

    const interceptedBack = (): void => {
      if (isDirty) {
        setPendingNavigationUrl(null);
        setShowNavigationDialog(true);
        return;
      }

      return originalBack();
    };

    (router as RouterLike).push = interceptedPush;
    (router as RouterLike).replace = interceptedReplace;
    (router as RouterLike).back = interceptedBack;

    document.addEventListener("click", handleLinkClick, true);

    return () => {
      (router as RouterLike).push = originalPush;
      (router as RouterLike).replace = originalReplace;
      (router as RouterLike).back = originalBack;

      document.removeEventListener("click", handleLinkClick, true);
    };
  }, [isDirty, pathname, router]);

  const confirmNavigation = useCallback((): void => {
    const originalMethods = originalRouterMethodsRef.current;

    if (!originalMethods) {
      if (pendingNavigationUrl) {
        router.push(pendingNavigationUrl);
      } else {
        router.back();
      }
    } else if (pendingNavigationUrl) {
      originalMethods.push(pendingNavigationUrl);
    } else {
      originalMethods.back();
    }

    setShowNavigationDialog(false);
    setPendingNavigationUrl(null);
  }, [pendingNavigationUrl, router]);

  const cancelNavigation = useCallback((): void => {
    setShowNavigationDialog(false);
    setPendingNavigationUrl(null);
  }, []);

  return {
    showNavigationDialog,
    setShowNavigationDialog,
    pendingNavigationUrl,
    confirmNavigation,
    cancelNavigation,
  };
}
