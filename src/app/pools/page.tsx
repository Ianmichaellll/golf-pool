"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabase/client";

type Pool = {
  id: string;
  name: string;
  tournament: string;
  status: string;
  num_teams: number;
  draft_type: string;
  invite_code: string;
  member_count: number;
  is_admin: boolean;
};

export default function PoolsPage() {
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function loadPools() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      // Single query: get pools + member count via join
      const { data: memberships } = await supabase
        .from("pool_members")
        .select("pool_id, pools(*, pool_members(count))")
        .eq("user_id", user.id);

      if (!memberships || memberships.length === 0) {
        setLoading(false);
        return;
      }

      const poolsWithInfo = memberships
        .map((m: Record<string, unknown>) => {
          const pool = m.pools as Record<string, unknown> | null;
          if (!pool) return null;
          const members = pool.pool_members as { count: number }[] | undefined;
          return {
            ...pool,
            member_count: members?.[0]?.count || 0,
            is_admin: pool.admin_id === user.id,
          } as Pool;
        })
        .filter((p): p is Pool => p !== null)
        .sort((a, b) => (b as unknown as { created_at: string }).created_at > (a as unknown as { created_at: string }).created_at ? 1 : -1);

      setPools(poolsWithInfo);
      setLoading(false);
    }
    loadPools();
  }, []);

  const statusLabel: Record<string, { text: string; color: string; bg: string }> = {
    open: { text: "Open", color: "var(--green)", bg: "#e8f5e9" },
    drafting: { text: "Drafting", color: "#e65100", bg: "#fff3e0" },
    active: { text: "Live", color: "#1565c0", bg: "#e3f2fd" },
    completed: { text: "Completed", color: "var(--gray-500)", bg: "var(--gray-100)" },
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p style={{ color: "var(--gray-400)" }}>Loading pools...</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold" style={{ color: "var(--gray-900)" }}>
          My Pools
        </h1>
        <button
          onClick={() => router.push("/pools/new")}
          className="px-4 py-2 rounded-lg text-white text-sm font-semibold"
          style={{ background: "var(--green)" }}
        >
          + Create Pool
        </button>
      </div>

      {pools.length === 0 ? (
        <div
          className="text-center py-16 rounded-xl border"
          style={{ borderColor: "var(--gray-200)", background: "var(--surface)" }}
        >
          <p className="text-lg font-medium mb-2" style={{ color: "var(--gray-700)" }}>
            No pools yet
          </p>
          <p className="text-sm mb-6" style={{ color: "var(--gray-500)" }}>
            Create a pool or join one with an invite link.
          </p>
          <button
            onClick={() => router.push("/pools/new")}
            className="px-6 py-2.5 rounded-lg text-white text-sm font-semibold"
            style={{ background: "var(--green)" }}
          >
            Create Your First Pool
          </button>
        </div>
      ) : (
        <>
          {/* Active Pools */}
          {pools.filter((p) => p.status !== "completed").length > 0 && (
            <div className="space-y-3 mb-8">
              {pools
                .filter((p) => p.status !== "completed")
                .map((pool) => {
                  const status = statusLabel[pool.status] || statusLabel.open;
                  return (
                    <button
                      key={pool.id}
                      onClick={() => router.push(pool.status === "open" ? `/pools/${pool.id}` : `/pools/${pool.id}/standings`)}
                      className="w-full text-left rounded-xl border p-4 transition-shadow hover:shadow-md"
                      style={{ borderColor: "var(--gray-200)", background: "var(--surface)" }}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h2 className="font-semibold" style={{ color: "var(--gray-900)" }}>
                            {pool.name}
                          </h2>
                          <p className="text-sm mt-0.5" style={{ color: "var(--gray-500)" }}>
                            {pool.tournament}
                          </p>
                        </div>
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ color: status.color, background: status.bg }}
                        >
                          {status.text}
                        </span>
                      </div>
                      <div className="flex gap-4 mt-3 text-xs" style={{ color: "var(--gray-500)" }}>
                        <span>{pool.member_count}/{pool.num_teams} teams</span>
                        <span>{pool.draft_type === "snake" ? "Snake" : "Regular"} draft</span>
                        {pool.is_admin && (
                          <span className="font-semibold" style={{ color: "var(--green)" }}>
                            Admin
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
            </div>
          )}

          {/* Past Pools */}
          {pools.filter((p) => p.status === "completed").length > 0 && (
            <>
              <h2
                className="text-sm font-semibold mb-3"
                style={{ color: "var(--gray-500)" }}
              >
                Past Pools
              </h2>
              <div className="space-y-3">
                {pools
                  .filter((p) => p.status === "completed")
                  .map((pool) => {
                    const status = statusLabel[pool.status] || statusLabel.open;
                    return (
                      <button
                        key={pool.id}
                        onClick={() => router.push(`/pools/${pool.id}/standings`)}
                        className="w-full text-left rounded-xl border p-4 transition-shadow hover:shadow-md"
                        style={{ borderColor: "var(--gray-200)", background: "var(--surface)" }}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <h2 className="font-semibold" style={{ color: "var(--gray-900)" }}>
                              {pool.name}
                            </h2>
                            <p className="text-sm mt-0.5" style={{ color: "var(--gray-500)" }}>
                              {pool.tournament}
                            </p>
                          </div>
                          <span
                            className="text-xs font-semibold px-2 py-0.5 rounded-full"
                            style={{ color: status.color, background: status.bg }}
                          >
                            {status.text}
                          </span>
                        </div>
                        <div className="flex gap-4 mt-3 text-xs" style={{ color: "var(--gray-500)" }}>
                          <span>{pool.member_count}/{pool.num_teams} teams</span>
                          <span>{pool.draft_type === "snake" ? "Snake" : "Regular"} draft</span>
                          {pool.is_admin && (
                            <span className="font-semibold" style={{ color: "var(--green)" }}>
                              Admin
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
