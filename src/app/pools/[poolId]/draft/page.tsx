"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";
import { MASTERS_2026_FIELD, oddsToNumber } from "../../../lib/golfers";
import type { Golfer } from "../../../lib/golfers";

// ─── Types ───────────────────────────────────────────────────────────
type Draft = {
  id: string;
  pool_id: string;
  status: string;
  draft_order: string[];
  current_pick: number;
  total_picks: number;
  current_turn_deadline: string | null;
  started_at: string | null;
};

type Pool = {
  id: string;
  name: string;
  tournament: string;
  num_teams: number;
  players_per_team: number;
  extras_count: number;
  draft_type: string;
  timer_seconds: number;
  admin_id: string;
};

type Pick = {
  pick_number: number;
  user_id: string;
  golfer_name: string;
  is_auto: boolean;
};

type Member = {
  user_id: string;
  display_name: string;
  draft_position: number;
};

// ─── Snake Draft Helper ──────────────────────────────────────────────
function getPickUserId(
  pickNumber: number,
  draftOrder: string[],
  numTeams: number,
  draftType: string
): string {
  const round = Math.floor(pickNumber / numTeams);
  const posInRound = pickNumber % numTeams;
  const isReversed = draftType === "snake" && round % 2 === 1;
  const index = isReversed ? numTeams - 1 - posInRound : posInRound;
  return draftOrder[index];
}

function getPickRound(pickNumber: number, numTeams: number): number {
  return Math.floor(pickNumber / numTeams) + 1;
}

// ─── Main Component ──────────────────────────────────────────────────
export default function DraftPage() {
  const { poolId } = useParams<{ poolId: string }>();
  const supabase = createClient();

  const [userId, setUserId] = useState<string | null>(null);
  const [pool, setPool] = useState<Pool | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [countdown, setCountdown] = useState("");
  const [phase, setPhase] = useState<"pre_draft" | "active" | "completed">("pre_draft");
  const [pickTimer, setPickTimer] = useState("");

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // ─── Load initial data ─────────────────────────────────────────────
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
      if (!poolData) return;
      setPool(poolData);

      const { data: draftData } = await supabase
        .from("drafts")
        .select("*")
        .eq("pool_id", poolId)
        .single();
      if (draftData) setDraft(draftData);

      // Load members with profiles
      const { data: memberData } = await supabase
        .from("pool_members")
        .select("user_id, draft_position")
        .eq("pool_id", poolId)
        .order("draft_position");

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

      // Load existing picks
      const { data: pickData } = await supabase
        .from("draft_picks")
        .select("pick_number, user_id, golfer_name, is_auto")
        .eq("pool_id", poolId)
        .order("pick_number");
      if (pickData) setPicks(pickData);

      setLoading(false);
    }
    load();
  }, [poolId]);

  // ─── Real-time subscriptions ───────────────────────────────────────
  useEffect(() => {
    if (!draft?.id) return;

    const pickChannel = supabase
      .channel("draft-picks")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "draft_picks",
          filter: `pool_id=eq.${poolId}`,
        },
        (payload) => {
          const newPick = payload.new as Pick;
          setPicks((prev) => {
            if (prev.some((p) => p.pick_number === newPick.pick_number))
              return prev;
            return [...prev, newPick].sort(
              (a, b) => a.pick_number - b.pick_number
            );
          });
        }
      )
      .subscribe();

    const draftChannel = supabase
      .channel("draft-state")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "drafts",
          filter: `pool_id=eq.${poolId}`,
        },
        (payload) => {
          setDraft(payload.new as Draft);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(pickChannel);
      supabase.removeChannel(draftChannel);
    };
  }, [draft?.id, poolId]);

  // ─── Countdown timer (pre-draft + pick timer) ─────────────────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      if (!draftRef.current?.started_at) return;

      const now = Date.now();
      const startTime = new Date(draftRef.current.started_at).getTime();
      const diff = startTime - now;

      if (diff > 0) {
        // Pre-draft countdown
        setPhase("pre_draft");
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setCountdown(`${mins}:${secs.toString().padStart(2, "0")}`);
        setPickTimer("");
      } else if (draftRef.current.status === "completed") {
        setPhase("completed");
        setCountdown("");
        setPickTimer("");
      } else {
        // Draft is active
        setPhase("active");
        setCountdown("");

        // Pick timer
        if (draftRef.current.current_turn_deadline) {
          const deadline = new Date(
            draftRef.current.current_turn_deadline
          ).getTime();
          const remaining = deadline - now;
          if (remaining > 0) {
            const mins = Math.floor(remaining / 60000);
            const secs = Math.floor((remaining % 60000) / 1000);
            setPickTimer(`${mins}:${secs.toString().padStart(2, "0")}`);
          } else {
            setPickTimer("0:00");
          }
        }
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [draft?.started_at, draft?.status, draft?.current_turn_deadline]);

  // ─── Get who picks at each slot ────────────────────────────────────
  const currentPickUserId = useCallback(() => {
    if (!draft || !pool) return null;
    return getPickUserId(
      draft.current_pick,
      draft.draft_order,
      pool.num_teams,
      pool.draft_type
    );
  }, [draft, pool]);

  const isMyTurn =
    phase === "active" && currentPickUserId() === userId;

  // ─── Available golfers ─────────────────────────────────────────────
  const pickedGolfers = new Set(picks.map((p) => p.golfer_name));
  const availableGolfers = MASTERS_2026_FIELD.filter(
    (g) => !pickedGolfers.has(g.name)
  ).filter(
    (g) =>
      !search ||
      g.name.toLowerCase().includes(search.toLowerCase()) ||
      g.country.toLowerCase().includes(search.toLowerCase())
  );

  // ─── Make a pick ───────────────────────────────────────────────────
  async function handlePick(golfer: Golfer) {
    if (!isMyTurn || !draft || !pool || picking) return;
    setPicking(true);

    try {
      const round = getPickRound(draft.current_pick, pool.num_teams);

      // Insert pick
      const { error: pickErr } = await supabase.from("draft_picks").insert({
        draft_id: draft.id,
        pool_id: poolId,
        user_id: userId,
        golfer_name: golfer.name,
        pick_number: draft.current_pick,
        round,
        is_auto: false,
      });
      if (pickErr) throw pickErr;

      // Advance draft
      const nextPick = draft.current_pick + 1;
      const isComplete = nextPick >= draft.total_picks;

      await supabase
        .from("drafts")
        .update({
          current_pick: nextPick,
          current_turn_deadline: isComplete
            ? null
            : new Date(
                Date.now() + pool.timer_seconds * 1000
              ).toISOString(),
          status: isComplete ? "completed" : "active",
          completed_at: isComplete ? new Date().toISOString() : null,
        })
        .eq("id", draft.id);
    } catch (err) {
      console.error("Pick error:", err);
    } finally {
      setPicking(false);
    }
  }

  // ─── Get display name for user id ──────────────────────────────────
  function getName(uid: string): string {
    return members.find((m) => m.user_id === uid)?.display_name || "Unknown";
  }

  // ─── Build draft board data ────────────────────────────────────────
  function buildBoard() {
    if (!pool || !draft) return { rounds: 0, board: [] };
    const totalRounds = pool.players_per_team + pool.extras_count;
    const board: (Pick | null)[][] = [];

    for (let r = 0; r < totalRounds; r++) {
      const row: (Pick | null)[] = [];
      for (let t = 0; t < pool.num_teams; t++) {
        const pickNum = r * pool.num_teams + t;
        const pick = picks.find((p) => p.pick_number === pickNum) || null;
        row.push(pick);
      }
      board.push(row);
    }
    return { rounds: totalRounds, board };
  }

  // ─── Draft order for display (columns) ─────────────────────────────
  function getColumnOrder(): string[] {
    if (!draft) return [];
    return draft.draft_order;
  }

  // ─── Loading ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p style={{ color: "var(--gray-400)" }}>Loading draft...</p>
      </div>
    );
  }

  if (!pool || !draft) return null;

  const { rounds, board } = buildBoard();
  const columnOrder = getColumnOrder();

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1
            className="text-lg font-bold"
            style={{ color: "var(--gray-900)" }}
          >
            {pool.name}
          </h1>
          <p className="text-xs" style={{ color: "var(--gray-500)" }}>
            {pool.tournament} &middot;{" "}
            {pool.draft_type === "snake" ? "Snake" : "Regular"} Draft
          </p>
        </div>
        {phase === "pre_draft" && (
          <div className="text-center">
            <p
              className="text-xs font-medium"
              style={{ color: "var(--gray-500)" }}
            >
              Draft starts in
            </p>
            <p
              className="text-2xl font-bold tabular-nums"
              style={{ color: "var(--green)" }}
            >
              {countdown}
            </p>
          </div>
        )}
        {phase === "active" && (
          <div className="text-center">
            <p
              className="text-xs font-medium"
              style={{ color: "var(--gray-500)" }}
            >
              Pick {draft.current_pick + 1} of {draft.total_picks}
            </p>
            <p
              className="text-2xl font-bold tabular-nums"
              style={{
                color:
                  pickTimer && parseInt(pickTimer) === 0
                    ? "red"
                    : "var(--green)",
              }}
            >
              {pickTimer}
            </p>
          </div>
        )}
        {phase === "completed" && (
          <div
            className="px-3 py-1 rounded-lg text-sm font-semibold"
            style={{ background: "var(--green)", color: "white" }}
          >
            Draft Complete
          </div>
        )}
      </div>

      {/* Current pick banner */}
      {phase === "active" && (
        <div
          className="rounded-lg px-4 py-3 mb-4 text-center"
          style={{
            background: isMyTurn ? "var(--green)" : "var(--gray-100)",
            color: isMyTurn ? "white" : "var(--gray-700)",
          }}
        >
          <p className="text-sm font-semibold">
            {isMyTurn
              ? "It's your turn to pick!"
              : `${getName(currentPickUserId()!)} is picking...`}
          </p>
          <p className="text-xs mt-0.5" style={{ opacity: 0.8 }}>
            Round {getPickRound(draft.current_pick, pool.num_teams)} &middot;
            Pick #{draft.current_pick + 1}
          </p>
        </div>
      )}

      {/* Pre-draft message */}
      {phase === "pre_draft" && (
        <div
          className="rounded-lg px-4 py-3 mb-4 text-center"
          style={{ background: "var(--gray-100)", color: "var(--gray-600)" }}
        >
          <p className="text-sm font-semibold">
            Pre-draft — Review the player list and get ready!
          </p>
          <p className="text-xs mt-1">
            Draft order:{" "}
            {columnOrder.map((uid, i) => (
              <span key={uid}>
                {i + 1}. {getName(uid)}
                {i < columnOrder.length - 1 ? " → " : ""}
              </span>
            ))}
          </p>
        </div>
      )}

      <div className="flex gap-4 flex-col lg:flex-row">
        {/* Draft Board */}
        <div className="flex-1 overflow-x-auto">
          <div
            className="rounded-xl border overflow-hidden"
            style={{ borderColor: "var(--gray-200)", background: "white" }}
          >
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: "var(--gray-50)" }}>
                  <th
                    className="px-2 py-2 text-left font-medium"
                    style={{ color: "var(--gray-500)" }}
                  >
                    Rd
                  </th>
                  {columnOrder.map((uid) => {
                    const isCurrentPicker =
                      phase === "active" && currentPickUserId() === uid;
                    return (
                      <th
                        key={uid}
                        className="px-2 py-2 text-center font-medium"
                        style={{
                          color: isCurrentPicker
                            ? "var(--green)"
                            : uid === userId
                            ? "var(--gray-900)"
                            : "var(--gray-500)",
                          minWidth: 80,
                        }}
                      >
                        {getName(uid)}
                        {uid === userId && (
                          <span
                            className="block text-[10px]"
                            style={{ color: "var(--green)" }}
                          >
                            (you)
                          </span>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {board.map((row, roundIdx) => (
                  <tr
                    key={roundIdx}
                    className="border-t"
                    style={{ borderColor: "var(--gray-100)" }}
                  >
                    <td
                      className="px-2 py-2 font-medium"
                      style={{ color: "var(--gray-400)" }}
                    >
                      {roundIdx + 1}
                    </td>
                    {columnOrder.map((uid, colIdx) => {
                      // Map column to correct pick based on snake/regular
                      const pickNum =
                        pool.draft_type === "snake" && roundIdx % 2 === 1
                          ? roundIdx * pool.num_teams +
                            (pool.num_teams - 1 - colIdx)
                          : roundIdx * pool.num_teams + colIdx;

                      const pick = picks.find(
                        (p) => p.pick_number === pickNum
                      );
                      const isCurrent =
                        phase === "active" &&
                        draft.current_pick === pickNum;

                      return (
                        <td
                          key={`${roundIdx}-${uid}`}
                          className="px-2 py-2 text-center"
                          style={{
                            background: isCurrent
                              ? "rgba(34, 139, 34, 0.08)"
                              : pick
                              ? "var(--gray-50)"
                              : "white",
                            color: pick
                              ? "var(--gray-900)"
                              : "var(--gray-300)",
                          }}
                        >
                          {pick ? (
                            <span className="text-xs font-medium">
                              {pick.golfer_name.split(" ").pop()}
                              {pick.is_auto && (
                                <span
                                  className="block text-[9px]"
                                  style={{ color: "var(--gray-400)" }}
                                >
                                  auto
                                </span>
                              )}
                            </span>
                          ) : isCurrent ? (
                            <span
                              className="inline-block w-2 h-2 rounded-full animate-pulse"
                              style={{ background: "var(--green)" }}
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Player List */}
        <div className="lg:w-80 shrink-0">
          <div
            className="rounded-xl border overflow-hidden"
            style={{ borderColor: "var(--gray-200)", background: "white" }}
          >
            <div className="px-3 py-2 border-b" style={{ borderColor: "var(--gray-100)" }}>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search players..."
                className="w-full px-2 py-1.5 rounded-lg border text-sm"
                style={{
                  borderColor: "var(--gray-200)",
                  background: "var(--gray-50)",
                }}
              />
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {availableGolfers.map((golfer) => (
                <div
                  key={golfer.name}
                  className="px-3 py-2 flex items-center justify-between border-b"
                  style={{ borderColor: "var(--gray-50)" }}
                >
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-medium truncate"
                      style={{ color: "var(--gray-900)" }}
                    >
                      {golfer.name}
                    </p>
                    <p className="text-[10px]" style={{ color: "var(--gray-400)" }}>
                      {golfer.country} &middot; #{golfer.rank} &middot;{" "}
                      {golfer.odds}
                    </p>
                  </div>
                  {isMyTurn && phase === "active" && (
                    <button
                      onClick={() => handlePick(golfer)}
                      disabled={picking}
                      className="ml-2 px-3 py-1 rounded-lg text-xs font-semibold text-white shrink-0"
                      style={{
                        background: "var(--green)",
                        opacity: picking ? 0.5 : 1,
                      }}
                    >
                      {picking ? "..." : "Pick"}
                    </button>
                  )}
                </div>
              ))}
              {availableGolfers.length === 0 && (
                <p
                  className="text-center text-sm py-4"
                  style={{ color: "var(--gray-400)" }}
                >
                  {search ? "No matching players" : "All players drafted"}
                </p>
              )}
            </div>
          </div>

          {/* Pick History */}
          {picks.length > 0 && (
            <div
              className="rounded-xl border mt-4 overflow-hidden"
              style={{ borderColor: "var(--gray-200)", background: "white" }}
            >
              <div
                className="px-3 py-2 border-b"
                style={{ borderColor: "var(--gray-100)" }}
              >
                <p
                  className="text-xs font-semibold"
                  style={{ color: "var(--gray-700)" }}
                >
                  Recent Picks
                </p>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {[...picks]
                  .reverse()
                  .slice(0, 20)
                  .map((pick) => (
                    <div
                      key={pick.pick_number}
                      className="px-3 py-1.5 flex items-center justify-between border-b text-xs"
                      style={{ borderColor: "var(--gray-50)" }}
                    >
                      <span style={{ color: "var(--gray-400)" }}>
                        #{pick.pick_number + 1}
                      </span>
                      <span
                        className="font-medium"
                        style={{ color: "var(--gray-900)" }}
                      >
                        {pick.golfer_name}
                      </span>
                      <span style={{ color: "var(--gray-500)" }}>
                        {getName(pick.user_id)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
