"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "../lib/supabase/client";

type UserInfo = {
  displayName: string;
  email: string;
} | null;

export default function NavBar() {
  const [user, setUser] = useState<UserInfo>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  useEffect(() => {
    async function getUser() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", authUser.id)
          .single();
        setUser({
          displayName: profile?.display_name || authUser.email?.split("@")[0] || "User",
          email: authUser.email || "",
        });
      } else {
        setUser(null);
      }
    }
    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      getUser();
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    setUser(null);
    setMenuOpen(false);
    router.push("/");
    router.refresh();
  }

  // Don't show nav on login page
  if (pathname === "/login") return null;

  return (
    <nav
      className="sticky top-0 z-50 border-b px-4 py-2.5 flex items-center justify-between"
      style={{
        background: "white",
        borderColor: "var(--gray-200)",
      }}
    >
      <a
        href="/"
        className="text-lg font-bold"
        style={{ color: "var(--green)" }}
      >
        Golf Pool
      </a>

      <div className="flex items-center gap-3">
        {user ? (
          <>
            <a
              href="/pools"
              className="text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
              style={{
                color: pathname.startsWith("/pools") ? "var(--green)" : "var(--gray-600)",
                background: pathname.startsWith("/pools") ? "var(--gray-100)" : "transparent",
              }}
            >
              My Pools
            </a>

            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-1.5 text-sm font-medium px-2 py-1.5 rounded-lg"
                style={{ color: "var(--gray-700)" }}
              >
                <span
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{ background: "var(--green)" }}
                >
                  {user.displayName[0].toUpperCase()}
                </span>
                <span className="hidden sm:inline">{user.displayName}</span>
              </button>

              {menuOpen && (
                <div
                  className="absolute right-0 top-full mt-1 w-48 rounded-lg border shadow-lg py-1"
                  style={{
                    background: "white",
                    borderColor: "var(--gray-200)",
                  }}
                >
                  <div className="px-3 py-2 border-b" style={{ borderColor: "var(--gray-100)" }}>
                    <p className="text-sm font-medium" style={{ color: "var(--gray-900)" }}>
                      {user.displayName}
                    </p>
                    <p className="text-xs" style={{ color: "var(--gray-500)" }}>
                      {user.email}
                    </p>
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <a
            href="/login"
            className="text-sm font-semibold px-4 py-1.5 rounded-lg text-white"
            style={{ background: "var(--green)" }}
          >
            Sign In
          </a>
        )}
      </div>
    </nav>
  );
}
