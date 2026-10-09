"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type PushState = {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  loading: boolean;
  // iOS Safari only supports web push once the site has been added to the
  // home screen (iOS 16.4+) — there's no install-prompt API like Android's,
  // so this is detected so the UI can show manual "Add to Home Screen"
  // instructions instead of a button that would otherwise silently fail.
  isIOS: boolean;
  isStandalone: boolean;
};

function detectIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // Classic iPhone/iPad/iPod UA check, plus iPadOS 13+ which reports as a
  // Mac but exposes multi-touch (a real Mac doesn't).
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function detectStandalone() {
  if (typeof window === "undefined") return false;
  return (
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

// The VAPID public key comes as a base64url string; the Push API wants it
// as a raw Uint8Array. Standard boilerplate for this conversion.
function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function authedFetch(url: string, body: unknown) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

export function useWebPush() {
  const [state, setState] = useState<PushState>({
    supported: false,
    permission: "unsupported",
    subscribed: false,
    loading: true,
    isIOS: false,
    isStandalone: false,
  });

  const refresh = useCallback(async () => {
    const isIOS = detectIOS();
    const isStandalone = detectStandalone();
    const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;

    if (!supported) {
      setState({ supported: false, permission: "unsupported", subscribed: false, loading: false, isIOS, isStandalone });
      return;
    }

    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const existing = await registration.pushManager.getSubscription();

      setState({
        supported: true,
        permission: Notification.permission,
        subscribed: !!existing,
        loading: false,
        isIOS,
        isStandalone,
      });
    } catch (error) {
      console.error("Push setup check failed:", error);
      setState({ supported: true, permission: Notification.permission, subscribed: false, loading: false, isIOS, isStandalone });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const subscribe = useCallback(async () => {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      console.error("NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set — push notifications aren't configured yet.");
      return { ok: false, error: "Push notifications aren't set up yet." };
    }

    // Must be called from a user gesture (a click handler) — browsers
    // ignore/block permission prompts triggered any other way.
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setState((prev) => ({ ...prev, permission }));
      return { ok: false, error: permission === "denied" ? "Notifications are blocked for this site." : "Permission not granted." };
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    const subJson = subscription.toJSON();
    const res = await authedFetch("/api/push/subscribe", {
      endpoint: subJson.endpoint,
      keys: subJson.keys,
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      return { ok: false, error: json.error || "Could not save subscription." };
    }

    setState((prev) => ({ ...prev, permission: "granted", subscribed: true }));
    return { ok: true };
  }, []);

  const unsubscribe = useCallback(async () => {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await authedFetch("/api/push/unsubscribe", { endpoint });
    }

    setState((prev) => ({ ...prev, subscribed: false }));
    return { ok: true };
  }, []);

  return { ...state, subscribe, unsubscribe, refresh };
}
