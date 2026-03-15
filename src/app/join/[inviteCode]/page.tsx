"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "../../lib/supabase/client";

export default function JoinPoolPage() {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const [poolName, setPoolName] = useState("");
  const [tournament, setTournament] = useState("");
  const [memberCount, setMemberCount] = useState(0);
  const [numTeams, setNumTeams] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "full" | "already" | "joining" | "error">("loading");
  const [error, setError] = useState("");
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function checkPool() {
      // Check if user is logged in
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push(`/login?redirect=/join/${inviteCode}`);
        return;
      }

      // Find pool by invite code — use RPC or direct query
      // Since RLS requires membership, we need a public lookup
      const { data: pool } = await supabase
        .from("pools")
        .select("id, name, tournament, num_teams, status, invite_code")
        .eq("invite_code", inviteCode)
        .single();

      if (!pool) {
        setError("Pool not found. Check the invite link.");
        setStatus("error");
        return;
      }

      setPoolName(pool.name);
      setTournament(pool.tournament);
      setNumTeams(pool.num_teams);

      // Check if already a member
      const { data: existing } = await supabase
        .from("pool_members")
        .select("user_id")
        .eq("pool_id", pool.id)
        .eq("user_id", user.id)
        .single();

      if (existing) {
        setStatus("already");
        setTimeout(() => router.push(`/pools/${pool.id}`), 1500);
        return;
      }

      // Check if pool is full
      const { count } = await supabase
        .from("pool_members")
        .select("*", { count: "exact", head: true })
        .eq("pool_id", pool.id);

      setMemberCount(count || 0);

      if ((count || 0) >= pool.num_teams) {
        setStatus("full");
        return;
      }

      setStatus("ready");
    }
    checkPool();
  }, [inviteCode]);

  async function handleJoin() {
    setStatus("joining");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");

      const { data: pool } = await supabase
        .from("pools")
        .select("id")
        .eq("invite_code", inviteCode)
        .single();

      if (!pool) throw new Error("Pool not found");

      const { error: joinErr } = await supabase
        .from("pool_members")
        .insert({ pool_id: pool.id, user_id: user.id });

      if (joinErr) throw joinErr;

      router.push(`/pools/${pool.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to join");
      setStatus("error");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div
        className="w-full max-w-sm rounded-xl border p-6 text-center"
        style={{ borderColor: "var(--gray-200)", background: "white" }}
      >
        {status === "loading" && (
          <p style={{ color: "var(--gray-400)" }}>Loading...</p>
        )}

        {status === "ready" && (
          <>
            <h1 className="text-lg font-bold mb-1" style={{ color: "var(--gray-900)" }}>
              Join Pool
            </h1>
            <p className="text-2xl font-bold mb-1" style={{ color: "var(--green)" }}>
              {poolName}
            </p>
            <p className="text-sm mb-4" style={{ color: "var(--gray-500)" }}>
              {tournament} &middot; {memberCount}/{numTeams} teams joined
            </p>
            <button
              onClick={handleJoin}
              className="w-full py-2.5 rounded-lg text-white text-sm font-semibold"
              style={{ background: "var(--green)" }}
            >
              Join Pool
            </button>
          </>
        )}

        {status === "joining" && (
          <p style={{ color: "var(--green)" }}>Joining...</p>
        )}

        {status === "already" && (
          <>
            <p className="text-sm font-medium" style={{ color: "var(--green)" }}>
              You're already in this pool!
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--gray-400)" }}>
              Redirecting...
            </p>
          </>
        )}

        {status === "full" && (
          <>
            <p className="text-lg font-bold mb-1" style={{ color: "var(--gray-900)" }}>
              {poolName}
            </p>
            <p className="text-sm text-red-600">This pool is full ({numTeams}/{numTeams} teams).</p>
          </>
        )}

        {status === "error" && (
          <p className="text-sm text-red-600">{error}</p>
        )}
      </div>
    </div>
  );
}
