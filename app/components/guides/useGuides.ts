"use client";

import { useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabaseClient";
import { LEGACY_IMPORTED, isSeen, mergeSeen, withSeen, withoutReplayable, type GuideKey } from "@/app/lib/guides";

// One shared store for every tour, tip and checklist on the page.
// - This browser's list (localStorage) answers instantly, so nothing flashes.
// - The profile's guides_seen is the real record, so a tip closed on a phone
//   stays closed on a laptop. Both are merged once per page load.
// Until the profile has answered, `ready` is false and guides stay hidden.

type State = { ready: boolean; userId: string | null; seen: string[] };

// The last person signed in on this browser and what they'd seen, so inline
// cards (checklists) can decide on the very first paint without a jump.
const LAST_USER = "lu_guides_last_user";
function initialState(): State {
  if (typeof window === "undefined") return { ready: false, userId: null, seen: [] };
  try {
    const userId = localStorage.getItem(LAST_USER);
    return { ready: false, userId, seen: userId ? readLocal(userId) : [] };
  } catch {
    return { ready: false, userId: null, seen: [] };
  }
}

let state: State | null = null;
function current(): State {
  return (state ??= initialState());
}
let started = false;
let watching = false;
// Whose guides are loaded: undefined until the first session read finishes.
let loadedFor: string | null | undefined;
const listeners = new Set<() => void>();

function emit(next: State) {
  state = next;
  try {
    if (next.userId) localStorage.setItem(LAST_USER, next.userId);
  } catch {
    // Storage blocked: the first paint just won't know, which is fine.
  }
  listeners.forEach((l) => l());
}

function localKey(userId: string) {
  return `lu_guides_${userId}`;
}

function readLocal(userId: string): string[] {
  try {
    const raw = localStorage.getItem(localKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(userId: string, seen: string[]) {
  try {
    localStorage.setItem(localKey(userId), JSON.stringify(seen));
  } catch {
    // Private mode or full storage: the profile copy still holds it.
  }
}

async function start() {
  if (started) return;
  started = true;
  // Someone else signs in on this tab (or signs out): start over for them.
  if (!watching) {
    watching = true;
    supabase.auth.onAuthStateChange((_event, session) => {
      const id = session?.user?.id || null;
      // The first event repeats the session start() is already reading.
      if (loadedFor === undefined || id === loadedFor) return;
      started = false;
      loadedFor = undefined;
      emit({ ready: false, userId: null, seen: [] });
      void start();
    });
  }
  // Reads the stored session: no network round trip, no auth lock.
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id || null;
  loadedFor = userId;
  if (!userId) return emit({ ready: false, userId: null, seen: [] });

  const local = readLocal(userId);
  const { data: row, error } = await supabase
    .from("profiles")
    .select("guides_seen, welcome_tour_seen_customer, welcome_tour_seen_professional, onboarding_checklist_dismissed")
    .eq("id", userId)
    .maybeSingle();
  // If the column can't be read (e.g. migration not applied yet), stay quiet
  // rather than show every tip again: guides are help, never a blocker.
  if (error) return emit({ ready: false, userId, seen: local });

  const remote = (row?.guides_seen as string[] | null) || [];
  // Tours and the pro checklist from before guides_seen existed: someone who
  // saw them then mustn't get them again now. Copied across once (marked
  // with LEGACY_IMPORTED), so "Replay the tour" isn't undone on the next load.
  const legacy = remote.includes(LEGACY_IMPORTED)
    ? []
    : [
        LEGACY_IMPORTED,
        row?.welcome_tour_seen_customer ? "tour:customer" : "",
        row?.welcome_tour_seen_professional ? "tour:pro" : "",
        row?.onboarding_checklist_dismissed ? "checklist:pro" : "",
      ];
  const seen = mergeSeen(remote, mergeSeen(legacy, local));
  writeLocal(userId, seen);
  emit({ ready: true, userId, seen });
  // This browser knew things the profile didn't: copy them up.
  if (seen.length !== remote.length) void save(userId, seen);
}

async function save(userId: string, seen: string[]) {
  const { error } = await supabase.from("profiles").update({ guides_seen: seen }).eq("id", userId);
  if (error) console.warn("Couldn't save guides_seen:", error.message);
}

export function markGuideSeen(key: GuideKey) {
  const s = current();
  if (!s.userId || isSeen(s.seen, key)) return;
  const seen = withSeen(s.seen, key);
  writeLocal(s.userId, seen);
  emit({ ...s, seen });
  // Only write to the profile once it's confirmed whose list this is.
  if (s.ready) void save(s.userId, seen);
}

// "Show tips again": brings back page tips and welcome tours.
export async function replayGuides() {
  const s = current();
  if (!s.userId || !s.ready) return;
  const seen = withoutReplayable(s.seen);
  writeLocal(s.userId, seen);
  emit({ ...s, seen });
  await save(s.userId, seen);
}

const SERVER: State = { ready: false, userId: null, seen: [] };

export function useGuides() {
  const s = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      void start();
      return () => listeners.delete(onChange);
    },
    current,
    () => SERVER
  );
  return {
    ready: s.ready,
    userId: s.userId,
    // Floating tips and tours: hidden until the profile has answered, so one
    // never flashes up and then disappears.
    shouldShow: (key: GuideKey) => s.ready && !isSeen(s.seen, key),
    // Inline cards: decided from this browser's list straight away (known on
    // first paint), then corrected by the profile.
    seen: (key: GuideKey) => isSeen(s.seen, key),
    // True once we know who's signed in (from this browser or the profile).
    known: !!s.userId,
  };
}
