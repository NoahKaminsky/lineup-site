import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

// Who's signed in, tolerant of transient auth errors.
//
// supabase.auth.getUser() can fail (or throw) for reasons that have nothing to
// do with being signed out — most often the auth lock being "stolen" when the
// navbar and the page ask at the same moment, or a brief network/Supabase
// hiccup. Pages used to treat any such error as "signed out" and bounce to
// /login (e.g. opening the Work tab). This falls back to the stored session
// (which refreshes itself if expired) and only returns null when there is
// genuinely no signed-in user.
export async function getSignedInUser(): Promise<User | null> {
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (user && !error) return user;
  } catch {
    // fall through to the stored session
  }

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.user ?? null;
  } catch {
    return null;
  }
}
