"use client";

import { createContext, useContext } from "react";
import type { NoticeValue, StudioData } from "./types";

export type RedirectTo = (path: string, body: unknown, key: string) => Promise<void>;

export type StudioContextValue = {
  data: StudioData;
  busy: string | null;
  run: (key: string, fn: () => Promise<void>) => Promise<void>;
  setNotice: (n: NoticeValue) => void;
  reload: () => Promise<void>;
  redirectTo: RedirectTo;
  openPlans: () => void;
};

export const StudioContext = createContext<StudioContextValue | null>(null);

// For pages under /studio once the shop exists (the layout only renders
// them then).
export function useStudio() {
  const value = useContext(StudioContext);
  if (!value || !value.data.studio) throw new Error("useStudio must be used inside the studio layout");
  return value;
}

// The sections of /studio, in nav order.
export const STUDIO_SECTIONS = [
  { slug: "", label: "Today" },
  { slug: "calendar", label: "Calendar" },
  { slug: "requests", label: "Requests" },
  { slug: "team", label: "Team" },
  { slug: "clients", label: "Clients" },
  { slug: "memberships", label: "Memberships" },
  { slug: "chairs", label: "Chairs" },
  { slug: "earnings", label: "Earnings" },
] as const;

export function studioHref(slug: string) {
  return slug ? `/studio/${slug}` : "/studio";
}
