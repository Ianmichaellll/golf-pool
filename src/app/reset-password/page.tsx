"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabase/client";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const router = useRouter();

  const supabase = createClient();

  // Confirm the recovery session exists before showing the form. If the user
  // landed here without clicking a recovery link (or the link expired), bounce
  // them to /forgot-password rather than letting them submit a no-op.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!data.session) {
        router.replace("/forgot-password");
        return;
      }
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [router, supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      router.push("/pools");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--gray-50)" }}>
        <p style={{ color: "var(--gray-400)" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--gray-50)" }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold" style={{ color: "var(--green)" }}>
            Golf Pool
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--gray-500)" }}>
            Set a new password
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1"
              style={{ color: "var(--gray-700)" }}>
              New password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              required
              minLength={6}
              autoFocus
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{
                borderColor: "var(--gray-300)",
                background: "var(--surface)",
              }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1"
              style={{ color: "var(--gray-700)" }}>
              Confirm new password
            </label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Type it again"
              required
              minLength={6}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{
                borderColor: "var(--gray-300)",
                background: "var(--surface)",
              }}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-white text-sm font-semibold transition-opacity"
            style={{
              background: "var(--green)",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "..." : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
