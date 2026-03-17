"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";

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
  espn_event_id: string | null;
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

type Player = {
  espnId: number;
  name: string;
  country: string;
  rank: number;
};

// ─── Headshot helper with placeholder fallback ──────────────────────
function headshotUrl(espnId: number): string {
  return `https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/${espnId}.png&w=80&h=58`;
}

function HeadshotImg({
  espnId,
  name,
  size = 32,
  className = "",
}: {
  espnId: number;
  name: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed || !espnId) {
    // Generic golfer silhouette placeholder
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full shrink-0 ${className}`}
        style={{
          width: size,
          height: size,
          background: "var(--gray-200)",
          color: "var(--gray-400)",
          fontSize: size * 0.4,
          fontWeight: 600,
        }}
      >
        {name?.[0]?.toUpperCase() || "?"}
      </span>
    );
  }

  return (
    <img
      src={headshotUrl(espnId)}
      alt={name}
      className={`rounded-full object-cover shrink-0 ${className}`}
      style={{ width: size, height: size, background: "var(--gray-200)" }}
      onError={() => setFailed(true)}
    />
  );
}

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
  const [players, setPlayers] = useState<Player[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [countdown, setCountdown] = useState("");
  const [phase, setPhase] = useState<"pre_draft" | "active" | "completed">(
    "pre_draft"
  );
  const [pickTimer, setPickTimer] = useState("");
  const [queue, setQueue] = useState<string[]>([]);
  const [queueTab, setQueueTab] = useState<"available" | "queue">("available");
  const queueRef = useRef<string[]>([]);
  queueRef.current = queue;

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const autoPickingRef = useRef(false);
  const picksRef = useRef(picks);
  picksRef.current = picks;
  const playersRef = useRef(players);
  playersRef.current = players;

  // Player lookup by name for headshots on the board
  const playerMap = useRef(new Map<string, Player>());

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

      // Fetch player field from ESPN
      if (poolData.espn_event_id) {
        try {
          const res = await fetch(
            `/api/tournaments/${poolData.espn_event_id}/field`
          );
          const data = await res.json();
          if (data.players?.length) {
            setPlayers(data.players);
            const map = new Map<string, Player>();
            data.players.forEach((p: Player) => map.set(p.name, p));
            playerMap.current = map;
          }
        } catch (err) {
          console.error("Failed to load field:", err);
        }
      }

      const { data: draftData } = await supabase
        .from("drafts")
        .select("*")
        .eq("pool_id", poolId)
        .single();
      if (draftData) setDraft(draftData);

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

      const { data: pickData } = await supabase
        .from("draft_picks")
        .select("pick_number, user_id, golfer_name, is_auto")
        .eq("pool_id", poolId)
        .order("pick_number");
      if (pickData) setPicks(pickData);

      // Load pick queue
      const { data: queueData } = await supabase
        .from("pick_queues")
        .select("ranked_golfers")
        .eq("pool_id", poolId)
        .eq("user_id", user.id)
        .single();
      if (queueData?.ranked_golfers) {
        const q = queueData.ranked_golfers as string[];
        setQueue(q);
        queueRef.current = q;
      }

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

  // ─── Countdown timer (pre-draft + pick timer + auto-pick) ──────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      if (!draftRef.current?.started_at) return;

      const now = Date.now();
      const startTime = new Date(draftRef.current.started_at).getTime();
      const diff = startTime - now;

      if (diff > 0) {
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
        setPhase("active");
        setCountdown("");

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
            // Timer expired — auto-pick!
            setPickTimer("0:00");
            if (!autoPickingRef.current) {
              autoPick();
            }
          }
        }
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [draft?.started_at, draft?.status, draft?.current_turn_deadline]);

  // ─── Set first pick timer when pre-draft ends ─────────────────────
  useEffect(() => {
    if (
      phase === "active" &&
      draft &&
      !draft.current_turn_deadline &&
      draft.current_pick === 0 &&
      pool
    ) {
      supabase
        .from("drafts")
        .update({
          current_turn_deadline: new Date(
            Date.now() + pool.timer_seconds * 1000
          ).toISOString(),
        })
        .eq("id", draft.id)
        .then(() => {});
    }
  }, [phase, draft?.current_turn_deadline, draft?.current_pick]);


  // ─── Get who picks at each slot ────────────────────────────────────
  // Use draft_order length as actual team count (may be less than pool.num_teams)
  const actualTeams = draft?.draft_order?.length || pool?.num_teams || 0;

  const currentPickUserId = useCallback(() => {
    if (!draft || !pool) return null;
    return getPickUserId(
      draft.current_pick,
      draft.draft_order,
      actualTeams,
      pool.draft_type
    );
  }, [draft, pool, actualTeams]);

  const isMyTurn = phase === "active" && currentPickUserId() === userId;

  // ─── Available players ─────────────────────────────────────────────
  const pickedGolfers = new Set(picks.map((p) => p.golfer_name));
  const availablePlayers = players
    .filter((g) => !pickedGolfers.has(g.name))
    .filter(
      (g) =>
        !search ||
        g.name.toLowerCase().includes(search.toLowerCase()) ||
        g.country.toLowerCase().includes(search.toLowerCase())
    );

  // ─── Make a pick (manual or auto) ───────────────────────────────────
  async function makePick(
    golferName: string,
    forUserId: string,
    isAuto: boolean
  ) {
    if (!draft || !pool) return;

    const round = getPickRound(draft.current_pick, actualTeams);

    const { error: pickErr } = await supabase.from("draft_picks").insert({
      draft_id: draft.id,
      pool_id: poolId,
      user_id: forUserId,
      golfer_name: golferName,
      pick_number: draft.current_pick,
      round,
      is_auto: isAuto,
    });
    if (pickErr) throw pickErr;

    const nextPick = draft.current_pick + 1;
    const isComplete = nextPick >= draft.total_picks;

    await supabase
      .from("drafts")
      .update({
        current_pick: nextPick,
        current_turn_deadline: isComplete
          ? null
          : new Date(Date.now() + pool.timer_seconds * 1000).toISOString(),
        status: isComplete ? "completed" : "active",
        completed_at: isComplete ? new Date().toISOString() : null,
      })
      .eq("id", draft.id);
  }

  async function handlePick(player: Player) {
    if (!isMyTurn || !draft || !pool || picking) return;
    setPicking(true);
    try {
      await makePick(player.name, userId!, false);
    } catch (err) {
      console.error("Pick error:", err);
    } finally {
      setPicking(false);
    }
  }

  // ─── Pick Queue helpers ────────────────────────────────────────────
  async function saveQueue(newQueue: string[]) {
    setQueue(newQueue);
    queueRef.current = newQueue;
    if (!userId) return;
    await supabase.from("pick_queues").upsert(
      { user_id: userId, pool_id: poolId, ranked_golfers: newQueue },
      { onConflict: "user_id,pool_id" }
    );
  }

  function addToQueue(playerName: string) {
    if (queue.includes(playerName)) return;
    saveQueue([...queue, playerName]);
  }

  function removeFromQueue(playerName: string) {
    saveQueue(queue.filter((n) => n !== playerName));
  }

  function moveInQueue(playerName: string, direction: "up" | "down") {
    const idx = queue.indexOf(playerName);
    if (idx === -1) return;
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= queue.length) return;
    const newQueue = [...queue];
    [newQueue[idx], newQueue[newIdx]] = [newQueue[newIdx], newQueue[idx]];
    saveQueue(newQueue);
  }

  // ─── Auto-pick: use queue first, then highest ranked ────────────────
  async function autoPick() {
    if (autoPickingRef.current) return;
    const currentDraft = draftRef.current;
    const currentPool = pool;
    if (!currentDraft || !currentPool || !userId) return;
    if (currentDraft.status === "completed") return;

    autoPickingRef.current = true;

    try {
      const pickedNames = new Set(picksRef.current.map((p) => p.golfer_name));

      // Check queue first for the picking user
      const pickForUserId = getPickUserId(
        currentDraft.current_pick,
        currentDraft.draft_order,
        currentDraft.draft_order.length,
        currentPool.draft_type
      );

      let bestAvailable: Player | undefined;

      // If this auto-pick is for a user with a queue, use their queue priority
      if (pickForUserId === userId) {
        const myQueue = queueRef.current;
        const queuePick = myQueue.find((name) => !pickedNames.has(name));
        if (queuePick) {
          bestAvailable = playersRef.current.find((p) => p.name === queuePick);
        }
      }

      // Fall back to highest ranked available
      if (!bestAvailable) {
        bestAvailable = playersRef.current.find(
          (p) => !pickedNames.has(p.name)
        );
      }
      if (!bestAvailable) return;

      await makePick(bestAvailable.name, pickForUserId, true);
    } catch (err) {
      console.error("Auto-pick error:", err);
    } finally {
      autoPickingRef.current = false;
    }
  }

  function getName(uid: string): string {
    return (
      members.find((m) => m.user_id === uid)?.display_name || "Unknown"
    );
  }

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

  const columnOrder = getColumnOrder();
  const totalRounds = pool.players_per_team + pool.extras_count;

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
          <button
            onClick={() => window.location.href = `/pools/${poolId}/standings`}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: "var(--green)" }}
          >
            View Pool Standings
          </button>
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
            Round {getPickRound(draft.current_pick, actualTeams)} &middot;
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

      {/* Draft complete banner */}
      {phase === "completed" && (
        <div
          className="rounded-lg px-4 py-4 mb-4 text-center"
          style={{ background: "var(--green)", color: "white" }}
        >
          <p className="text-sm font-semibold">
            Draft Complete! All {draft.total_picks} picks are in.
          </p>
          <button
            onClick={() => window.location.href = `/pools/${poolId}/standings`}
            className="mt-2 px-6 py-2 rounded-lg text-sm font-semibold"
            style={{ background: "white", color: "var(--green)" }}
          >
            View Pool Standings
          </button>
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
                {Array.from({ length: totalRounds }).map((_, roundIdx) => (
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
                      const pickNum =
                        pool.draft_type === "snake" && roundIdx % 2 === 1
                          ? roundIdx * actualTeams +
                            (actualTeams - 1 - colIdx)
                          : roundIdx * actualTeams + colIdx;

                      const pick = picks.find(
                        (p) => p.pick_number === pickNum
                      );
                      const isCurrent =
                        phase === "active" &&
                        draft.current_pick === pickNum;
                      const pickedPlayer = pick
                        ? playerMap.current.get(pick.golfer_name)
                        : null;

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
                            <div className="flex flex-col items-center gap-0.5">
                              <HeadshotImg
                                espnId={pickedPlayer?.espnId || 0}
                                name={pick.golfer_name}
                                size={24}
                              />
                              <span className="text-xs font-medium leading-tight">
                                {pick.golfer_name.split(" ").pop()}
                              </span>
                              {pick.is_auto && (
                                <span
                                  className="text-[9px]"
                                  style={{ color: "var(--gray-400)" }}
                                >
                                  auto
                                </span>
                              )}
                            </div>
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
            {/* Tab toggle: Available / My Queue */}
            <div
              className="flex gap-1 p-1 border-b"
              style={{ borderColor: "var(--gray-100)", background: "var(--gray-50)" }}
            >
              <button
                onClick={() => setQueueTab("available")}
                className="flex-1 py-1.5 text-xs font-medium rounded-md transition-colors"
                style={{
                  background: queueTab === "available" ? "white" : "transparent",
                  color: queueTab === "available" ? "var(--gray-900)" : "var(--gray-500)",
                  boxShadow: queueTab === "available" ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
                }}
              >
                Available ({availablePlayers.length})
              </button>
              <button
                onClick={() => setQueueTab("queue")}
                className="flex-1 py-1.5 text-xs font-medium rounded-md transition-colors"
                style={{
                  background: queueTab === "queue" ? "white" : "transparent",
                  color: queueTab === "queue" ? "var(--gray-900)" : "var(--gray-500)",
                  boxShadow: queueTab === "queue" ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
                }}
              >
                My Queue ({queue.filter((n) => !pickedGolfers.has(n)).length})
              </button>
            </div>

            {/* Available Players Tab */}
            {queueTab === "available" && (
              <>
                <div
                  className="px-3 py-2 border-b"
                  style={{ borderColor: "var(--gray-100)" }}
                >
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
                  {availablePlayers.map((player) => (
                    <div
                      key={player.espnId}
                      className="px-3 py-2 flex items-center justify-between border-b"
                      style={{ borderColor: "var(--gray-50)" }}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <HeadshotImg
                          espnId={player.espnId}
                          name={player.name}
                          size={32}
                        />
                        <div className="min-w-0">
                          <p
                            className="text-sm font-medium truncate"
                            style={{ color: "var(--gray-900)" }}
                          >
                            {player.name}
                          </p>
                          <p
                            className="text-[10px]"
                            style={{ color: "var(--gray-400)" }}
                          >
                            {player.country}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 ml-2 shrink-0">
                        {!queue.includes(player.name) && (
                          <button
                            onClick={() => addToQueue(player.name)}
                            className="px-2 py-1 rounded text-[10px] font-semibold border"
                            style={{
                              borderColor: "var(--gray-200)",
                              color: "var(--gray-500)",
                            }}
                            title="Add to queue"
                          >
                            +Q
                          </button>
                        )}
                        {queue.includes(player.name) && (
                          <span
                            className="px-2 py-1 text-[10px] font-medium"
                            style={{ color: "var(--green)" }}
                          >
                            #{queue.indexOf(player.name) + 1}
                          </span>
                        )}
                        {isMyTurn && phase === "active" && (
                          <button
                            onClick={() => handlePick(player)}
                            disabled={picking}
                            className="px-3 py-1 rounded-lg text-xs font-semibold text-white"
                            style={{
                              background: "var(--green)",
                              opacity: picking ? 0.5 : 1,
                            }}
                          >
                            {picking ? "..." : "Pick"}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {availablePlayers.length === 0 && (
                    <p
                      className="text-center text-sm py-4"
                      style={{ color: "var(--gray-400)" }}
                    >
                      {search ? "No matching players" : "All players drafted"}
                    </p>
                  )}
                </div>
              </>
            )}

            {/* My Queue Tab */}
            {queueTab === "queue" && (
              <div className="max-h-[60vh] overflow-y-auto">
                {queue.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <p className="text-sm" style={{ color: "var(--gray-400)" }}>
                      No players queued yet.
                    </p>
                    <p className="text-xs mt-1" style={{ color: "var(--gray-400)" }}>
                      Add players from the Available tab to set your auto-pick priority.
                    </p>
                  </div>
                ) : (
                  queue.map((name, idx) => {
                    const drafted = pickedGolfers.has(name);
                    const player = playerMap.current.get(name);
                    return (
                      <div
                        key={name}
                        className="px-3 py-2 flex items-center justify-between border-b"
                        style={{
                          borderColor: "var(--gray-50)",
                          opacity: drafted ? 0.4 : 1,
                        }}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span
                            className="w-5 text-center text-xs font-semibold shrink-0"
                            style={{ color: "var(--gray-400)" }}
                          >
                            {idx + 1}
                          </span>
                          <HeadshotImg
                            espnId={player?.espnId || 0}
                            name={name}
                            size={28}
                          />
                          <p
                            className={`text-sm font-medium truncate ${drafted ? "line-through" : ""}`}
                            style={{ color: drafted ? "var(--gray-400)" : "var(--gray-900)" }}
                          >
                            {name}
                          </p>
                        </div>
                        {!drafted && (
                          <div className="flex items-center gap-1 ml-2 shrink-0">
                            <button
                              onClick={() => moveInQueue(name, "up")}
                              disabled={idx === 0}
                              className="w-6 h-6 flex items-center justify-center rounded text-xs"
                              style={{
                                color: idx === 0 ? "var(--gray-200)" : "var(--gray-500)",
                              }}
                              title="Move up"
                            >
                              ▲
                            </button>
                            <button
                              onClick={() => moveInQueue(name, "down")}
                              disabled={idx === queue.length - 1}
                              className="w-6 h-6 flex items-center justify-center rounded text-xs"
                              style={{
                                color: idx === queue.length - 1 ? "var(--gray-200)" : "var(--gray-500)",
                              }}
                              title="Move down"
                            >
                              ▼
                            </button>
                            <button
                              onClick={() => removeFromQueue(name)}
                              className="w-6 h-6 flex items-center justify-center rounded text-xs text-red-400"
                              title="Remove"
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
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
