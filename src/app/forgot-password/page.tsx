"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "../lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?redirect=/reset-password`,
      });
      if (error) throw error;
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
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
            Reset your password
          </p>
        </div>

        {sent ? (
          <div className="space-y-4">
            <div className="text-sm px-4 py-3 rounded-lg"
              style={{ background: "var(--surface)", color: "var(--gray-700)" }}>
              Check your inbox at <strong>{email}</strong> for a reset link.
              The link expires in 1 hour.
            </div>
            <p className="text-xs text-center" style={{ color: "var(--gray-500)" }}>
              Didn&apos;t get it? Check spam, or wait a minute and try again.
            </p>
            <Link href="/login"
              className="block text-center text-sm font-semibold underline"
              style={{ color: "var(--green)" }}>
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1"
                  style={{ color: "var(--gray-700)" }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
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
                {loading ? "..." : "Send reset link"}
              </button>
            </form>

            <p className="text-center text-sm mt-6" style={{ color: "var(--gray-500)" }}>
              Remembered it?{" "}
              <Link href="/login"
                className="font-semibold underline"
                style={{ color: "var(--green)" }}>
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
