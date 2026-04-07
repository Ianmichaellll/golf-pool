"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "../../lib/supabase/client";

type PoolDetails = {
  id: string;
  name: string;
  tournament: string;
  invite_code: string;
  admin_id: string;
  players_per_team: number;
  draft_type: string;
  num_teams: number;
  extras_count: number;
  timer_seconds: number;
  draft_start_time: string | null;
  espn_event_id: string | null;
  status: string;
};

type Member = {
  user_id: string;
  display_name: string;
  joined_at: string;
  draft_position: number | null;
};

export default function PoolLobbyPage() {
  const { poolId } = useParams<{ poolId: string }>();
  const [pool, setPool] = useState<PoolDetails | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    num_teams: 0,
    players_per_team: 0,
    draft_type: "snake",
    extras_count: 0,
    timer_seconds: 120,
  });
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  // Helper to load member profiles
  async function loadMembers() {
    const { data: memberData } = await supabase
      .from("pool_members")
      .select("user_id, joined_at, draft_position")
      .eq("pool_id", poolId)
      .order("joined_at");

    if (memberData) {
      const userIds = memberData.map((m) => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", userIds);

      const profileMap = new Map(
        profiles?.map((p) => [p.id, p.display_name]) || []
      );
      setMembers(
        memberData.map((m) => ({
          ...m,
          display_name: profileMap.get(m.user_id) || "Unknown",
        }))
      );
    }
  }

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: poolData } = await supabase
        .from("pools")
        .select("*")
        .eq("id", poolId)
        .single();

      if (!poolData) {
        router.push("/pools");
        return;
      }
      // Non-open pools go straight to standings
      if (poolData.status !== "open") {
        router.replace(`/pools/${poolId}/standings`);
        return;
      }
      setPool(poolData);
      await loadMembers();
      setLoading(false);
    }
    load();
  }, [poolId]);

  // ─── Real-time: auto-update when members join/leave ────────────────
  useEffect(() => {
    const channel = supabase
      .channel("lobby-members")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pool_members",
          filter: `pool_id=eq.${poolId}`,
        },
        () => {
          loadMembers();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pools",
          filter: `id=eq.${poolId}`,
        },
        (payload) => {
          setPool(payload.new as PoolDetails);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [poolId]);

  function copyInviteLink() {
    if (!pool) return;
    const link = `${window.location.origin}/join/${pool.invite_code}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleRemoveMember(memberId: string) {
    if (!confirm("Remove this member from the pool?")) return;
    await supabase
      .from("pool_members")
      .delete()
      .eq("pool_id", poolId)
      .eq("user_id", memberId);
    setMembers(members.filter((m) => m.user_id !== memberId));
  }

  function startEditing() {
    if (!pool) return;
    setEditForm({
      num_teams: pool.num_teams,
      players_per_team: pool.players_per_team,
      draft_type: pool.draft_type,
      extras_count: pool.extras_count,
      timer_seconds: pool.timer_seconds,
    });
    setEditing(true);
  }

  async function handleSaveSettings() {
    if (!pool) return;
    setSaving(true);
    const totalPicks =
      editForm.num_teams * (editForm.players_per_team + editForm.extras_count);

    const { error } = await supabase
      .from("pools")
      .update({
        num_teams: editForm.num_teams,
        players_per_team: editForm.players_per_team,
        draft_type: editForm.draft_type,
        extras_count: editForm.extras_count,
        timer_seconds: editForm.timer_seconds,
      })
      .eq("id", poolId);

    if (!error) {
      await supabase
        .from("drafts")
        .update({ total_picks: totalPicks })
        .eq("pool_id", poolId);

      setPool({
        ...pool,
        ...editForm,
      });
      setEditing(false);
    }
    setSaving(false);
  }

  async function handleStartDraft() {
    if (!pool || members.length < 2) return;

    // Shuffle all pool members into draft order
    const shuffled = [...members]
      .sort(() => Math.random() - 0.5)
      .map((m, i) => ({ user_id: m.user_id, position: i + 1 }));

    for (const s of shuffled) {
      await supabase
        .from("pool_members")
        .update({ draft_position: s.position })
        .eq("pool_id", poolId)
        .eq("user_id", s.user_id);
    }

    const draftOrder = shuffled
      .sort((a, b) => a.position - b.position)
      .map((s) => s.user_id);

    // Use actual member count for picks (not num_teams, in case not all joined)
    const actualTeams = members.length;
    const totalPicks =
      actualTeams * (pool.players_per_team + pool.extras_count);

    // 5-minute pre-draft countdown
    const draftStartsAt = new Date(Date.now() + 5 * 60 * 1000);

    await supabase
      .from("drafts")
      .update({
        status: "active",
        draft_order: draftOrder,
        current_pick: 0,
        total_picks: totalPicks,
        started_at: draftStartsAt.toISOString(),
      })
      .eq("pool_id", poolId);

    await supabase
      .from("pools")
      .update({ status: "drafting" })
      .eq("id", poolId);

    router.push(`/pools/${poolId}/draft`);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p style={{ color: "var(--gray-400)" }}>Loading...</p>
      </div>
    );
  }

  if (!pool) return null;

  const isAdmin = userId === pool.admin_id;
  const isFull = members.length >= pool.num_teams;
  const hasEnoughMembers = members.length >= 2;

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      {/* Pool Header */}
      <div className="mb-6">
        <h1
          className="text-xl font-bold"
          style={{ color: "var(--gray-900)" }}
        >
          {pool.name}
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--gray-500)" }}>
          {pool.tournament} &middot;{" "}
          {pool.draft_type === "snake" ? "Snake" : "Regular"} draft &middot;{" "}
          {pool.players_per_team} players/team
        </p>
      </div>

      {/* Invite Link */}
      <div
        className="rounded-xl border p-4 mb-6"
        style={{ borderColor: "var(--gray-200)", background: "var(--surface)" }}
      >
        <p
          className="text-sm font-medium mb-2"
          style={{ color: "var(--gray-700)" }}
        >
          Invite Friends
        </p>
        <div className="flex gap-2">
          <input
            readOnly
            value={`${typeof window !== "undefined" ? window.location.origin : ""}/join/${pool.invite_code}`}
            className="flex-1 px-3 py-2 rounded-lg border text-xs"
            style={{
              borderColor: "var(--gray-200)",
              background: "var(--gray-50)",
              color: "var(--gray-600)",
            }}
          />
          <button
            onClick={copyInviteLink}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white shrink-0"
            style={{
              background: copied ? "var(--green-light)" : "var(--green)",
            }}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      {/* Members */}
      <div
        className="rounded-xl border mb-6"
        style={{ borderColor: "var(--gray-200)", background: "var(--surface)" }}
      >
        <div
          className="px-4 py-3 border-b"
          style={{ borderColor: "var(--gray-100)" }}
        >
          <p
            className="text-sm font-semibold"
            style={{ color: "var(--gray-900)" }}
          >
            Members ({members.length}/{pool.num_teams})
          </p>
        </div>
        <div className="divide-y" style={{ borderColor: "var(--gray-100)" }}>
          {members.map((member) => (
            <div
              key={member.user_id}
              className="px-4 py-3 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{ background: "var(--green)" }}
                >
                  {member.display_name[0].toUpperCase()}
                </span>
                <div>
                  <p
                    className="text-sm font-medium"
                    style={{ color: "var(--gray-900)" }}
                  >
                    {member.display_name}
                  </p>
                  {member.user_id === pool.admin_id && (
                    <p className="text-xs" style={{ color: "var(--green)" }}>
                      Admin
                    </p>
                  )}
                </div>
              </div>
              {isAdmin &&
                member.user_id !== userId &&
                pool.status === "open" && (
                  <button
                    onClick={() => handleRemoveMember(member.user_id)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                )}
            </div>
          ))}
          {!isFull && (
            <div className="px-4 py-3">
              <p className="text-sm" style={{ color: "var(--gray-400)" }}>
                Waiting for {pool.num_teams - members.length} more...
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Settings Summary */}
      <div
        className="rounded-xl border p-4 mb-6"
        style={{ borderColor: "var(--gray-200)", background: "var(--surface)" }}
      >
        <div className="flex items-center justify-between mb-2">
          <p
            className="text-sm font-semibold"
            style={{ color: "var(--gray-900)" }}
          >
            Draft Settings
          </p>
          {isAdmin && pool.status === "open" && !editing && (
            <button
              onClick={startEditing}
              className="text-xs font-medium px-2 py-1 rounded-md"
              style={{ color: "var(--green)", background: "var(--gray-100)" }}
            >
              Edit
            </button>
          )}
        </div>

        {editing ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs" style={{ color: "var(--gray-500)" }}>Teams</span>
                <select
                  value={editForm.num_teams}
                  onChange={(e) => setEditForm({ ...editForm, num_teams: Number(e.target.value) })}
                  className="mt-1 w-full px-2 py-1.5 rounded-lg border text-sm"
                  style={{ borderColor: "var(--gray-200)", background: "var(--gray-50)", color: "var(--gray-800)" }}
                >
                  {Array.from({ length: 13 }, (_, i) => i + 2).map((n) => (
                    <option key={n} value={n} disabled={n < members.length}>
                      {n}{n < members.length ? ` (${members.length} joined)` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs" style={{ color: "var(--gray-500)" }}>Players/team</span>
                <select
                  value={editForm.players_per_team}
                  onChange={(e) => setEditForm({ ...editForm, players_per_team: Number(e.target.value) })}
                  className="mt-1 w-full px-2 py-1.5 rounded-lg border text-sm"
                  style={{ borderColor: "var(--gray-200)", background: "var(--gray-50)", color: "var(--gray-800)" }}
                >
                  {[3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs" style={{ color: "var(--gray-500)" }}>Draft type</span>
                <select
                  value={editForm.draft_type}
                  onChange={(e) => setEditForm({ ...editForm, draft_type: e.target.value })}
                  className="mt-1 w-full px-2 py-1.5 rounded-lg border text-sm"
                  style={{ borderColor: "var(--gray-200)", background: "var(--gray-50)", color: "var(--gray-800)" }}
                >
                  <option value="snake">Snake</option>
                  <option value="regular">Regular</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs" style={{ color: "var(--gray-500)" }}>Pick timer</span>
                <select
                  value={editForm.timer_seconds}
                  onChange={(e) => setEditForm({ ...editForm, timer_seconds: Number(e.target.value) })}
                  className="mt-1 w-full px-2 py-1.5 rounded-lg border text-sm"
                  style={{ borderColor: "var(--gray-200)", background: "var(--gray-50)", color: "var(--gray-800)" }}
                >
                  {[60, 90, 120, 180, 300].map((s) => (
                    <option key={s} value={s}>{s}s</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs" style={{ color: "var(--gray-500)" }}>Extra picks</span>
                <select
                  value={editForm.extras_count}
                  onChange={(e) => setEditForm({ ...editForm, extras_count: Number(e.target.value) })}
                  className="mt-1 w-full px-2 py-1.5 rounded-lg border text-sm"
                  style={{ borderColor: "var(--gray-200)", background: "var(--gray-50)", color: "var(--gray-800)" }}
                >
                  {[0, 1, 2, 3].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
              <div className="flex items-end">
                <p className="text-xs pb-2" style={{ color: "var(--gray-500)" }}>
                  Total picks:{" "}
                  <span className="font-medium" style={{ color: "var(--gray-800)" }}>
                    {editForm.num_teams * (editForm.players_per_team + editForm.extras_count)}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSaveSettings}
                disabled={saving}
                className="flex-1 py-2 rounded-lg text-white text-sm font-semibold"
                style={{ background: "var(--green)", opacity: saving ? 0.6 : 1 }}
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="flex-1 py-2 rounded-lg text-sm font-medium border"
                style={{ borderColor: "var(--gray-200)", color: "var(--gray-600)", background: "var(--surface)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div
              className="grid grid-cols-2 gap-2 text-sm"
              style={{ color: "var(--gray-600)" }}
            >
              <p>
                Teams: <span className="font-medium">{pool.num_teams}</span>
              </p>
              <p>
                Players/team:{" "}
                <span className="font-medium">{pool.players_per_team}</span>
              </p>
              <p>
                Draft type:{" "}
                <span className="font-medium">
                  {pool.draft_type === "snake" ? "Snake" : "Regular"}
                </span>
              </p>
              <p>
                Pick timer:{" "}
                <span className="font-medium">{pool.timer_seconds}s</span>
              </p>
              <p>
                Extra picks:{" "}
                <span className="font-medium">{pool.extras_count}</span>
              </p>
              <p>
                Total picks:{" "}
                <span className="font-medium">
                  {pool.num_teams * (pool.players_per_team + pool.extras_count)}
                </span>
              </p>
            </div>
            {pool.draft_start_time && (
              <div
                className="mt-3 pt-3 border-t"
                style={{ borderColor: "var(--gray-100)" }}
              >
                <p className="text-sm" style={{ color: "var(--gray-700)" }}>
                  Draft starts:{" "}
                  <span
                    className="font-semibold"
                    style={{ color: "var(--green)" }}
                  >
                    {new Date(pool.draft_start_time).toLocaleString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      timeZoneName: "short",
                    })}
                  </span>
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Actions */}
      {pool.status === "drafting" && (
        <div className="space-y-2">
          <button
            onClick={() => router.push(`/pools/${poolId}/draft`)}
            className="w-full py-3 rounded-lg text-white text-sm font-semibold"
            style={{ background: "var(--green)" }}
          >
            Enter Draft
          </button>
          <button
            onClick={() => router.push(`/pools/${poolId}/standings`)}
            className="w-full py-2.5 rounded-lg text-sm font-medium border"
            style={{
              borderColor: "var(--gray-200)",
              color: "var(--gray-600)",
              background: "var(--surface)",
            }}
          >
            View Standings
          </button>
        </div>
      )}

      {/* Completed pools redirect to standings in useEffect */}

      {isAdmin && pool.status === "open" && (
        <button
          onClick={handleStartDraft}
          disabled={!hasEnoughMembers}
          className="w-full py-3 rounded-lg text-white text-sm font-semibold transition-opacity"
          style={{
            background: "var(--green)",
            opacity: hasEnoughMembers ? 1 : 0.4,
            cursor: hasEnoughMembers ? "pointer" : "not-allowed",
          }}
        >
          {hasEnoughMembers
            ? "Randomize Order & Start Draft"
            : `Need ${2 - members.length} more member${2 - members.length !== 1 ? "s" : ""} to start`}
        </button>
      )}

      {!isAdmin && pool.status === "open" && (
        <p
          className="text-center text-sm mt-2"
          style={{ color: "var(--gray-400)" }}
        >
          Waiting for admin to start the draft...
        </p>
      )}
    </div>
  );
}
