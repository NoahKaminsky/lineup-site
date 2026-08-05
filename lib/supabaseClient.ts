import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Cookie-based (not localStorage) so the session is visible to server-side
// route handlers and Server Components, and so /auth/callback's server-set
// session is actually readable here after email confirmation / password reset.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);