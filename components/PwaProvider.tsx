"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type PwaContextValue = {
  mounted: boolean;
  isStandalone: boolean;
  canPromptInstall: boolean;
  isIosInstallable: boolean;
  triggerInstall: () => Promise<boolean>;
};

const PwaContext = createContext<PwaContextValue>({
  mounted: false,
  isStandalone: false,
  canPromptInstall: false,
  isIosInstallable: false,
  triggerInstall: async () => false,
});

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mediaStandalone = window.matchMedia?.("(display-mode: standalone)")
    ?.matches;
  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
    true;
  return Boolean(mediaStandalone || iosStandalone);
}

function detectIosTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent.toLowerCase();
  const isClassicIos = /iphone|ipad|ipod/.test(ua);
  const isIpadOs =
    ua.includes("macintosh") && (window.navigator.maxTouchPoints ?? 0) > 1;
  return isClassicIos || isIpadOs;
}

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIosDevice, setIsIosDevice] = useState(false);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    setMounted(true);
    setIsStandalone(detectStandalone());
    setIsIosDevice(detectIosTouchDevice());

    const mql = window.matchMedia?.("(display-mode: standalone)");
    const onDisplayChange = () => setIsStandalone(detectStandalone());
    mql?.addEventListener?.("change", onDisplayChange);

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    if ("serviceWorker" in navigator && typeof window !== "undefined") {
      const registerSw = () => {
        navigator.serviceWorker
          .register("/sw.js", { scope: "/" })
          .catch(() => {
            // Ignore SW registration failures on restricted embedded webviews.
          });
      };

      if (document.readyState === "complete") {
        registerSw();
      } else {
        window.addEventListener("load", registerSw, { once: true });
      }
    }

    return () => {
      mql?.removeEventListener?.("change", onDisplayChange);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const triggerInstall = useCallback(async () => {
    if (!deferredPrompt) return false;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setDeferredPrompt(null);
        return true;
      }
    } catch {
      // Prompt dismissed or already consumed.
    }
    return false;
  }, [deferredPrompt]);

  const value = useMemo<PwaContextValue>(
    () => ({
      mounted,
      isStandalone,
      canPromptInstall: deferredPrompt !== null && !isStandalone,
      isIosInstallable: isIosDevice && !isStandalone && deferredPrompt === null,
      triggerInstall,
    }),
    [mounted, isStandalone, deferredPrompt, isIosDevice, triggerInstall],
  );

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}

export function usePwaInstall(): PwaContextValue {
  return useContext(PwaContext);
}
