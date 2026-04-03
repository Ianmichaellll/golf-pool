"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";

// ── Types ───────────────────────────────────────────────────────────

type PlayerDisplay = {
  name: string;
  position: string;
  score: string;
  thru?: string;
  today?: string;
  isActive: boolean;
  isExtra?: boolean;
  countsForScore?: boolean;
};

type TeamDisplay = {
  id: string;
  owner: string;
  players: PlayerDisplay[];
  totalScore: number;
  positionSum: number;
};

type LeaderboardEntry = {
  name: string;
  position: string;
  score: string;
  today: string;
  thru: string;
  isPoolPlayer: boolean;
};

type APIResponse = {
  tournament: string;
  poolName: string;
  status: string;
  round?: number;
  draftStatus: string;
  teams: TeamDisplay[];
  leaderboard?: LeaderboardEntry[];
  updatedAt: string;
};

type DraftPick = {
  pick_number: number;
  round: number;
  user_id: string;
  owner: string;
  golfer_name: string;
  is_auto: boolean;
};

type HistoryResponse = {
  poolName: string;
  tournament: string;
  completedAt: string;
  teams: TeamDisplay[];
  draftResults: DraftPick[];
  draftType: string;
  numTeams: number;
  playersPerTeam: number;
};

// ── Helpers ─────────────────────────────────────────────────────────

function getPositionStyle(pos: string): string {
  if (pos === "WD" || pos === "MC" || pos === "DQ") return "text-red-500";
  const num = parseInt(pos.replace("T", ""));
  if (!isNaN(num) && num <= 10) return "font-semibold";
  return "";
}

function getScoreStyle(score: string): string {
  if (score.startsWith("-")) return "text-red-600";
  return "";
}

// ── Components ──────────────────────────────────────────────────────

function TeamCard({
  team,
  rank,
  isArchived,
}: {
  team: TeamDisplay;
  rank: number;
  isArchived: boolean;
}) {
  const [open, setOpen] = useState(rank === 1 && isArchived);
  // Scoring players (starters + promoted extras that count)
  const scoringPlayers = team.players.filter((p) => p.countsForScore);
  // WD starters (replaced by extras, shown separately)
  const wdPlayers = team.players.filter((p) => !p.countsForScore && !p.isExtra && (p.position === "WD" || p.position === "DQ"));
  // Unused bench extras
  const benchPlayers = team.players.filter((p) => p.isExtra);
  const activePlayers = scoringPlayers;
  const isWinner = rank === 1 && isArchived;

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        borderColor: isWinner ? "var(--green)" : "var(--gray-200)",
        background: "white",
        boxShadow: isWinner ? "0 0 0 1px var(--green)" : undefined,
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 border-b cursor-pointer transition-colors"
        style={{ borderColor: "var(--gray-100)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold"
            style={{
              background: rank <= 3 ? "var(--green)" : "var(--gray-100)",
              color: rank <= 3 ? "white" : "var(--gray-500)",
            }}
          >
            {rank}
          </div>
          <div className="text-left">
            <div className="font-semibold" style={{ color: "var(--gray-900)" }}>
              {team.owner}
              {isWinner && (
                <span className="ml-2 text-xs font-semibold" style={{ color: "var(--green)" }}>
                  Winner
                </span>
              )}
            </div>
            <div className="text-xs" style={{ color: "var(--gray-400)" }}>
              {activePlayers.length} active player{activePlayers.length !== 1 ? "s" : ""}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-2xl font-bold tabular-nums" style={{ color: "var(--gray-900)" }}>
              {team.totalScore > 0 ? "+" : ""}{team.totalScore}
            </div>
            <div className="text-xs tabular-nums" style={{ color: "var(--gray-400)" }}>
              Pos: {team.positionSum}
            </div>
          </div>
          <svg
            className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`}
            style={{ color: "var(--gray-400)" }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div>
          <div
            className="grid grid-cols-12 px-3 sm:px-5 py-2 text-[10px] sm:text-xs uppercase tracking-wide"
            style={{ color: "var(--gray-400)" }}
          >
            <div className={isArchived ? "col-span-6" : "col-span-4"}>Player</div>
            <div className={isArchived ? "col-span-3" : "col-span-2"} style={{ textAlign: "center" }}>Pos</div>
            <div className={isArchived ? "col-span-3" : "col-span-2"} style={{ textAlign: "center" }}>Score</div>
            {!isArchived && <div className="col-span-2 text-center">Thru</div>}
            {!isArchived && <div className="col-span-2 text-center">Today</div>}
          </div>

          {activePlayers.map((player) => (
            <div
              key={player.name}
              className={`grid grid-cols-12 px-3 sm:px-5 py-2.5 items-center border-t`}
              style={{ borderColor: "var(--gray-50)" }}
            >
              <div
                className={`${isArchived ? "col-span-6" : "col-span-4"} text-xs sm:text-sm font-medium truncate`}
                style={{ color: "var(--gray-800)" }}
              >
                {player.name}
              </div>
              <div
                className={`${isArchived ? "col-span-3" : "col-span-2"} text-center text-xs sm:text-sm tabular-nums ${getPositionStyle(player.position)}`}
                style={{ color: "var(--gray-700)" }}
              >
                {player.position}
              </div>
              <div
                className={`${isArchived ? "col-span-3" : "col-span-2"} text-center text-xs sm:text-sm font-medium tabular-nums ${getScoreStyle(player.score)}`}
                style={{ color: "var(--gray-700)" }}
              >
                {player.score}
              </div>
              {!isArchived && (
                <div
                  className="col-span-2 text-center text-xs sm:text-sm tabular-nums"
                  style={{ color: "var(--gray-500)" }}
                >
                  {player.thru}
                </div>
              )}
              {!isArchived && (
                <div
                  className={`col-span-2 text-center text-xs sm:text-sm tabular-nums ${getScoreStyle(player.today || "")}`}
                  style={{ color: "var(--gray-700)" }}
                >
                  {player.today}
                </div>
              )}
            </div>
          ))}

          {wdPlayers.length > 0 && (
            <div className="px-3 sm:px-5 pt-2 pb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-red-400">Withdrawn</span>
            </div>
          )}
          {wdPlayers.map((player) => (
            <div
              key={player.name}
              className={`grid grid-cols-12 px-3 sm:px-5 py-2.5 items-center border-t`}
              style={{ borderColor: "var(--gray-50)", background: "rgba(239,68,68,0.04)" }}
            >
              <div
                className={`${isArchived ? "col-span-6" : "col-span-4"} text-xs sm:text-sm line-through truncate`}
                style={{ color: "var(--gray-400)" }}
              >
                {player.name}
              </div>
              <div className={`${isArchived ? "col-span-3" : "col-span-2"} text-center text-xs sm:text-sm font-medium text-red-500`}>
                WD
              </div>
              <div className={`${isArchived ? "col-span-3" : "col-span-2"} text-center text-xs sm:text-sm`} style={{ color: "var(--gray-400)" }}>
                {player.score}
              </div>
              {!isArchived && (
                <div className="col-span-2 text-center text-xs sm:text-sm" style={{ color: "var(--gray-400)" }}>--</div>
              )}
              {!isArchived && (
                <div className="col-span-2 text-center text-xs sm:text-sm" style={{ color: "var(--gray-400)" }}>--</div>
              )}
            </div>
          ))}

          {benchPlayers.length > 0 && (
            <div className="px-3 sm:px-5 pt-2 pb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--gray-400)" }}>Bench</span>
            </div>
          )}
          {benchPlayers.map((player) => (
            <div
              key={player.name}
              className={`grid grid-cols-12 px-3 sm:px-5 py-2.5 items-center border-t`}
              style={{ borderColor: "var(--gray-50)", opacity: 0.5 }}
            >
              <div
                className={`${isArchived ? "col-span-6" : "col-span-4"} text-xs sm:text-sm truncate`}
                style={{ color: "var(--gray-500)" }}
              >
                {player.name}
              </div>
              <div className={`${isArchived ? "col-span-3" : "col-span-2"} text-center text-xs sm:text-sm`} style={{ color: "var(--gray-400)" }}>
                {player.position}
              </div>
              <div className={`${isArchived ? "col-span-3" : "col-span-2"} text-center text-xs sm:text-sm`} style={{ color: "var(--gray-400)" }}>
                {player.score}
              </div>
              {!isArchived && (
                <div className="col-span-2 text-center text-xs sm:text-sm" style={{ color: "var(--gray-400)" }}>{player.thru}</div>
              )}
              {!isArchived && (
                <div className="col-span-2 text-center text-xs sm:text-sm" style={{ color: "var(--gray-400)" }}>{player.today}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DraftBoard({ picks, draftType }: { picks: DraftPick[]; draftType: string }) {
  // Group picks by round
  const rounds = new Map<number, DraftPick[]>();
  for (const pick of picks) {
    const arr = rounds.get(pick.round) || [];
    arr.push(pick);
    rounds.set(pick.round, arr);
  }

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: "var(--gray-200)", background: "white" }}
    >
      <div
        className="px-5 py-3 border-b"
        style={{ borderColor: "var(--gray-100)" }}
      >
        <p className="text-sm font-semibold" style={{ color: "var(--gray-900)" }}>
          Draft Recap
        </p>
        <p className="text-xs" style={{ color: "var(--gray-400)" }}>
          {draftType === "snake" ? "Snake" : "Regular"} draft &middot; {picks.length} picks
        </p>
      </div>

      {Array.from(rounds.entries())
        .sort(([a], [b]) => a - b)
        .map(([round, roundPicks]) => (
          <div key={round}>
            <div
              className="px-5 py-1.5 text-[10px] uppercase tracking-wide font-semibold"
              style={{ background: "var(--gray-50)", color: "var(--gray-400)" }}
            >
              Round {round}
            </div>
            {roundPicks.map((pick) => (
              <div
                key={pick.pick_number}
                className="flex items-center justify-between px-5 py-2 border-t"
                style={{ borderColor: "var(--gray-50)" }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="text-xs tabular-nums font-medium w-6 text-center"
                    style={{ color: "var(--gray-400)" }}
                  >
                    {pick.pick_number}
                  </span>
                  <div>
                    <span className="text-sm" style={{ color: "var(--gray-900)" }}>
                      {pick.golfer_name}
                    </span>
                    {pick.is_auto && (
                      <span className="ml-2 text-[10px]" style={{ color: "var(--gray-400)" }}>
                        auto
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-xs" style={{ color: "var(--gray-500)" }}>
                  {pick.owner}
                </span>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}

function LeaderboardTable({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: "var(--gray-200)", background: "white" }}
    >
      <div
        className="grid grid-cols-12 px-3 sm:px-5 py-2.5 border-b text-[10px] sm:text-xs uppercase tracking-wide"
        style={{ borderColor: "var(--gray-100)", color: "var(--gray-400)" }}
      >
        <div className="col-span-1 text-center">Pos</div>
        <div className="col-span-5">Player</div>
        <div className="col-span-3 text-center">Score</div>
        <div className="col-span-3 text-center">Today</div>
      </div>
      {entries.map((entry) => {
        const isMcWd = entry.position === "MC" || entry.position === "WD";
        const thruDisplay =
          entry.thru !== "--" && entry.thru !== "F"
            ? `(${entry.thru})`
            : entry.thru === "F"
              ? "(F)"
              : "";
        return (
          <div
            key={entry.name}
            className={`grid grid-cols-12 px-3 sm:px-5 py-2 items-center border-t ${isMcWd ? "opacity-50" : ""}`}
            style={{
              borderColor: "var(--gray-50)",
              background: "white",
            }}
          >
            <div
              className="col-span-1 text-center text-xs sm:text-sm font-medium tabular-nums"
              style={{ color: "var(--gray-900)" }}
            >
              {entry.position}
            </div>
            <div
              className="col-span-5 text-xs sm:text-sm truncate"
              style={{ color: "var(--gray-900)" }}
            >
              {entry.name}
              {entry.isPoolPlayer && (
                <span className="ml-1 text-[10px]" style={{ color: "var(--green)" }}>
                  ●
                </span>
              )}
            </div>
            <div
              className="col-span-3 text-center text-xs sm:text-sm font-medium tabular-nums"
              style={{ color: "var(--gray-900)" }}
            >
              {entry.score}
            </div>
            <div
              className="col-span-3 text-center text-xs sm:text-sm tabular-nums"
              style={{ color: "var(--gray-900)" }}
            >
              <span className={entry.today.startsWith("-") ? "text-red-600" : ""}>
                {entry.today}
              </span>
              {thruDisplay && (
                <span className="ml-1" style={{ color: "var(--gray-400)" }}>
                  {thruDisplay}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────

export default function PoolStandingsPage() {
  const { poolId } = useParams<{ poolId: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [tab, setTab] = useState<"pool" | "leaderboard" | "draft">("pool");
  const [data, setData] = useState<APIResponse | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [poolStatus, setPoolStatus] = useState<string>("");
  const [finalizing, setFinalizing] = useState(false);

  // Check if user is admin and get pool status
  useEffect(() => {
    async function checkAdmin() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: pool } = await supabase
        .from("pools")
        .select("admin_id, status")
        .eq("id", poolId)
        .single();

      if (pool) {
        setIsAdmin(pool.admin_id === user.id);
        setPoolStatus(pool.status);
      }
    }
    checkAdmin();
  }, [poolId]);

  // Try loading archived history first for completed pools
  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await fetch(`/api/pools/${poolId}/history`);
        if (res.ok) {
          const json: HistoryResponse = await res.json();
          setHistory(json);
          setLoading(false);
          return;
        }
      } catch {
        // No history — fall through to live scores
      }
      // Not archived yet — fetch live
      fetchScores();
    }
    loadHistory();
  }, [poolId]);

  const fetchScores = useCallback(async () => {
    try {
      const res = await fetch(`/api/pools/${poolId}/scores`);
      if (!res.ok) throw new Error("API error");
      const json: APIResponse = await res.json();
      setData(json);
    } catch (err) {
      console.error("Failed to fetch pool scores:", err);
    } finally {
      setLoading(false);
    }
  }, [poolId]);

  // Auto-refresh only for live (non-archived) pools
  useEffect(() => {
    if (history) return; // archived — no polling
    const interval = setInterval(fetchScores, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchScores, history]);

  async function handleFinalize() {
    if (!confirm("Finalize this pool? This will lock in the current standings as the final results.")) return;
    setFinalizing(true);
    try {
      const res = await fetch(`/api/pools/${poolId}/finalize`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "Failed to finalize pool");
        return;
      }
      // Reload as archived
      const histRes = await fetch(`/api/pools/${poolId}/history`);
      if (histRes.ok) {
        setHistory(await histRes.json());
        setPoolStatus("completed");
      }
    } catch (err) {
      alert("Failed to finalize pool. Please try again.");
      console.error(err);
    } finally {
      setFinalizing(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p style={{ color: "var(--gray-400)" }}>Loading scores...</p>
      </div>
    );
  }

  // ── Archived (completed) view ──────────────────────────────────────

  if (history) {
    const completedDate = new Date(history.completedAt).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <button
            onClick={() => router.push("/pools")}
            className="text-sm mb-3 inline-block"
            style={{ color: "var(--green)" }}
          >
            &larr; My Pools
          </button>
          <h1
            className="text-2xl font-bold tracking-tight mb-1"
            style={{ color: "var(--gray-900)" }}
          >
            {history.poolName}
          </h1>
          <div className="text-sm mb-1" style={{ color: "var(--gray-500)" }}>
            {history.tournament}
          </div>
          <div className="text-xs mb-4" style={{ color: "var(--gray-400)" }}>
            Completed {completedDate}
          </div>

          <div
            className="inline-flex items-center gap-2 border rounded-full px-4 py-1.5 text-sm"
            style={{ borderColor: "var(--gray-200)", background: "white" }}
          >
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex rounded-full h-2 w-2 bg-gray-400" />
            </span>
            <span style={{ color: "var(--gray-600)" }}>Final Results</span>
          </div>
        </div>

        {/* Tabs */}
        <div
          className="flex gap-1 rounded-lg p-1 mb-6"
          style={{ background: "var(--gray-100)" }}
        >
          <button
            onClick={() => setTab("pool")}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === "pool" ? "shadow-sm" : ""
            }`}
            style={{
              background: tab === "pool" ? "white" : "transparent",
              color: tab === "pool" ? "var(--gray-900)" : "var(--gray-500)",
            }}
          >
            Standings
          </button>
          <button
            onClick={() => setTab("draft")}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === "draft" ? "shadow-sm" : ""
            }`}
            style={{
              background: tab === "draft" ? "white" : "transparent",
              color: tab === "draft" ? "var(--gray-900)" : "var(--gray-500)",
            }}
          >
            Draft Recap
          </button>
        </div>

        {/* Standings Tab */}
        {tab === "pool" && (
          <>
            <div className="space-y-4">
              {history.teams.map((team, i) => (
                <TeamCard key={team.id} team={team} rank={i + 1} isArchived />
              ))}
            </div>
            <div className="text-center mt-8">
              <p className="text-xs" style={{ color: "var(--gray-400)" }}>
                Points = sum of player positions (lower is better)
              </p>
            </div>
          </>
        )}

        {/* Draft Recap Tab */}
        {tab === "draft" && history.draftResults && (
          <DraftBoard picks={history.draftResults} draftType={history.draftType} />
        )}
      </div>
    );
  }

  // ── Live (active) view ─────────────────────────────────────────────

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p style={{ color: "var(--gray-400)" }}>Could not load pool data.</p>
      </div>
    );
  }

  if (data.draftStatus === "pending") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <p style={{ color: "var(--gray-500)" }}>
          The draft hasn&apos;t started yet for this pool.
        </p>
        <button
          onClick={() => router.push(`/pools/${poolId}`)}
          className="px-6 py-2 rounded-lg text-white text-sm font-semibold"
          style={{ background: "var(--green)" }}
        >
          Back to Lobby
        </button>
      </div>
    );
  }

  const isLive = data.teams.some((t) =>
    t.players.some((p) => p.thru !== "--" && p.thru !== "F")
  );
  const noScoresYet = data.teams.every((t) =>
    t.players.every((p) => p.position === "--")
  );

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <button
          onClick={() => router.push("/pools")}
          className="text-sm mb-3 inline-block"
          style={{ color: "var(--green)" }}
        >
          &larr; My Pools
        </button>
        <h1
          className="text-2xl font-bold tracking-tight mb-1"
          style={{ color: "var(--gray-900)" }}
        >
          {data.poolName}
        </h1>
        <div className="text-sm mb-1" style={{ color: "var(--gray-500)" }}>
          {data.tournament}
        </div>
        <div className="text-xs mb-4" style={{ color: "var(--gray-400)" }}>
          {data.round ? `Round ${data.round} — ${today}` : today}
        </div>

        <div
          className="inline-flex items-center gap-2 border rounded-full px-4 py-1.5 text-sm"
          style={{ borderColor: "var(--gray-200)", background: "white" }}
        >
          <span className="relative flex h-2 w-2">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                isLive ? "bg-green-400" : "bg-yellow-400"
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                isLive ? "bg-green-500" : "bg-yellow-500"
              }`}
            />
          </span>
          <span style={{ color: "var(--gray-600)" }}>{data.status}</span>
        </div>

        {data.updatedAt && (
          <div className="text-xs mt-2" style={{ color: "var(--gray-400)" }}>
            Updated {new Date(data.updatedAt).toLocaleTimeString()}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div
        className="flex gap-1 rounded-lg p-1 mb-6"
        style={{ background: "var(--gray-100)" }}
      >
        <button
          onClick={() => setTab("pool")}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
            tab === "pool" ? "shadow-sm" : ""
          }`}
          style={{
            background: tab === "pool" ? "white" : "transparent",
            color: tab === "pool" ? "var(--gray-900)" : "var(--gray-500)",
          }}
        >
          Pool
        </button>
        <button
          onClick={() => setTab("leaderboard")}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
            tab === "leaderboard" ? "shadow-sm" : ""
          }`}
          style={{
            background: tab === "leaderboard" ? "white" : "transparent",
            color: tab === "leaderboard" ? "var(--gray-900)" : "var(--gray-500)",
          }}
        >
          Leaderboard
        </button>
      </div>

      {/* Pool Tab */}
      {tab === "pool" && (
        <>
          {noScoresYet && data.draftStatus === "completed" && (
            <div
              className="rounded-xl border p-4 mb-4 text-center text-sm"
              style={{
                borderColor: "var(--gray-200)",
                background: "white",
                color: "var(--gray-500)",
              }}
            >
              Draft complete! Scores will appear once the tournament begins.
            </div>
          )}
          {data.draftStatus === "active" && (
            <div
              className="rounded-xl border p-4 mb-4 text-center"
              style={{ borderColor: "var(--gray-200)", background: "white" }}
            >
              <p className="text-sm" style={{ color: "var(--gray-500)" }}>
                Draft is still in progress.
              </p>
              <button
                onClick={() => router.push(`/pools/${poolId}/draft`)}
                className="mt-2 px-4 py-1.5 rounded-lg text-white text-sm font-semibold"
                style={{ background: "var(--green)" }}
              >
                Go to Draft
              </button>
            </div>
          )}
          <div className="space-y-4">
            {data.teams.map((team, i) => (
              <TeamCard key={team.id} team={team} rank={i + 1} isArchived={false} />
            ))}
          </div>

          {/* Finalize button for admin */}
          {isAdmin && poolStatus === "active" && (
            <div className="mt-6">
              <button
                onClick={handleFinalize}
                disabled={finalizing}
                className="w-full py-3 rounded-lg text-sm font-semibold border-2 transition-colors"
                style={{
                  borderColor: "var(--green)",
                  color: "var(--green)",
                  background: "white",
                  opacity: finalizing ? 0.5 : 1,
                }}
              >
                {finalizing ? "Finalizing..." : "Finalize Pool & Lock Results"}
              </button>
              <p className="text-center text-xs mt-2" style={{ color: "var(--gray-400)" }}>
                Snapshots the current standings as the final results
              </p>
            </div>
          )}

          <div className="text-center mt-8">
            <p className="text-xs" style={{ color: "var(--gray-400)" }}>
              Points = sum of player positions (lower is better) · Updates every
              5 min
            </p>
          </div>
        </>
      )}

      {/* Leaderboard Tab */}
      {tab === "leaderboard" && data.leaderboard && (
        <>
          <LeaderboardTable entries={data.leaderboard} />
          <div className="text-center mt-4">
            <p className="text-xs" style={{ color: "var(--gray-400)" }}>
              <span style={{ color: "var(--green)" }}>●</span> = drafted in this pool
            </p>
          </div>
        </>
      )}
    </div>
  );
}
