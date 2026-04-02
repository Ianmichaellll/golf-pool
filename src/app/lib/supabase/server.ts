import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, {
                ...options,
                maxAge: COOKIE_MAX_AGE,
              })
            );
          } catch {
            // Can be ignored in Server Components (read-only)
          }
        },
      },
    }
  );
}
