"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "../components/ThemeProvider";

export default function SettingsPage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <button
        onClick={() => router.back()}
        className="text-sm mb-6 inline-block"
        style={{ color: "var(--green)" }}
      >
        &larr; Back
      </button>

      <h1
        className="text-2xl font-bold tracking-tight mb-6"
        style={{ color: "var(--gray-900)" }}
      >
        Settings
      </h1>

      <div
        className="rounded-xl border overflow-hidden"
        style={{ borderColor: "var(--gray-200)", background: "var(--surface)" }}
      >
        <div
          className="px-5 py-3 border-b"
          style={{ borderColor: "var(--gray-100)" }}
        >
          <p className="text-sm font-semibold" style={{ color: "var(--gray-900)" }}>
            Appearance
          </p>
        </div>

        <div className="px-5 py-4">
          <p className="text-sm mb-3" style={{ color: "var(--gray-600)" }}>
            Choose your preferred theme
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setTheme("light")}
              className="flex-1 rounded-lg border-2 p-3 transition-colors"
              style={{
                borderColor: theme === "light" ? "var(--green)" : "var(--gray-200)",
                background: theme === "light" ? "rgba(45,106,79,0.05)" : "var(--surface)",
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-8 h-8 rounded-full border flex items-center justify-center"
                  style={{ borderColor: "#e5e5e5", background: "#ffffff" }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#171717" strokeWidth="2">
                    <circle cx="12" cy="12" r="5" />
                    <line x1="12" y1="1" x2="12" y2="3" />
                    <line x1="12" y1="21" x2="12" y2="23" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                    <line x1="1" y1="12" x2="3" y2="12" />
                    <line x1="21" y1="12" x2="23" y2="12" />
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                  </svg>
                </div>
                {theme === "light" && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--green)" stroke="var(--green)" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
              <p className="text-sm font-medium text-left" style={{ color: "var(--gray-900)" }}>
                Light
              </p>
            </button>

            <button
              onClick={() => setTheme("dark")}
              className="flex-1 rounded-lg border-2 p-3 transition-colors"
              style={{
                borderColor: theme === "dark" ? "var(--green)" : "var(--gray-200)",
                background: theme === "dark" ? "rgba(64,145,108,0.1)" : "var(--surface)",
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-8 h-8 rounded-full border flex items-center justify-center"
                  style={{ borderColor: "#2e2e2e", background: "#141414" }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f5f5f5" strokeWidth="2">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                </div>
                {theme === "dark" && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--green)" stroke="var(--green)" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
              <p className="text-sm font-medium text-left" style={{ color: "var(--gray-900)" }}>
                Dark
              </p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
