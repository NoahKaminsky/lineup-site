import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

// Who's signed in, for the browser — tolerant of transient auth errors.
//
// Reads the stored session first: it's local (no network), and refreshes
// itself if the token has expired. This only decides what the page shows;
// every read and write is still checked by Supabase against the token (RLS),
// so a stale session can't see anything it shouldn't. That makes the old
// supabase.auth.getUser() call — a full round trip to the Auth server before
// each page's data could even start loading — unnecessary in the normal case.
// It's kept as the fallback for when no stored session can be read.
export async function getSignedInUser(): Promise<User | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user) return session.user;
  } catch {
    // fall through to the network check
  }

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    return user && !error ? user : null;
  } catch {
    return null;
  }
}
