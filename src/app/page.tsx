"use client";

import { useState, useEffect, useCallback } from "react";
import { POOL_DATA } from "./lib/pool-data";

// ── Helpers ─────────────────────────────────────────────────────────

function getPositionStyle(pos: string): string {
  if (pos === "1") return "text-green-700 font-semibold";
  if (pos === "WD" || pos === "MC" || pos === "DQ") return "text-red-500";
  if (pos.startsWith("T") && parseInt(pos.replace("T", "")) <= 10)
    return "text-green-700";
  return "text-gray-700";
}

function getScoreStyle(score: string): string {
  if (score.startsWith("-")) return "text-red-600";
  if (score.startsWith("+")) return "text-gray-500";
  return "text-gray-600";
}

// ── Types ───────────────────────────────────────────────────────────

type PlayerDisplay = {
  name: string;
  position: string;
  score: string;
  thru: string;
  today: string;
  isActive: boolean;
};

type TeamDisplay = {
  id: string;
  owner: string;
  players: PlayerDisplay[];
  totalPoints: number;
  tiebreaker: number;
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
  status: string;
  round?: number;
  teams: TeamDisplay[];
  leaderboard?: LeaderboardEntry[];
  updatedAt: string;
};

// ── Components ──────────────────────────────────────────────────────

function TournamentHeader({
  name,
  status,
  round,
  lastUpdated,
  isLive,
}: {
  name: string;
  status: string;
  round: number | null;
  lastUpdated: string | null;
  isLive: boolean;
}) {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="text-center mb-8">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-1">
        Golf Pool
      </h1>
      <div className="text-gray-500 text-sm mb-1">{name}</div>
      {round && <div className="text-gray-500 text-xs font-medium mb-1">Round {round}</div>}
      <div className="text-gray-400 text-xs mb-4">{today}</div>
      <div className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-1.5 text-sm">
        <span className="relative flex h-2 w-2">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isLive ? "bg-green-400" : "bg-yellow-400"}`}></span>
          <span className={`relative inline-flex rounded-full h-2 w-2 ${isLive ? "bg-green-500" : "bg-yellow-500"}`}></span>
        </span>
        <span className="text-gray-600">{status}</span>
      </div>
      {lastUpdated && (
        <div className="text-xs text-gray-400 mt-2">
          Updated {new Date(lastUpdated).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

function TeamCard({ team, rank }: { team: TeamDisplay; rank: number }) {
  const [open, setOpen] = useState(false);
  const activePlayers = team.players.filter((p) => p.isActive);
  const wdPlayers = team.players.filter((p) => !p.isActive);

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Team header — tap to toggle */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold bg-gray-100 text-gray-500">
            {rank}
          </div>
          <div className="text-left">
            <div className="font-semibold text-gray-900">{team.owner}</div>
            <div className="text-xs text-gray-400">
              {activePlayers.length} active players
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900 tabular-nums">
              {team.totalPoints}
              <span className="text-xs font-normal text-gray-400 ml-1">pts</span>
            </div>
            <div className="text-xs text-gray-400 tabular-nums">
              Tiebreak: {team.tiebreaker > 0 ? "+" : ""}
              {team.tiebreaker}
            </div>
          </div>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Players table */}
      {open && <div className="divide-y divide-gray-50">
        <div className="grid grid-cols-12 px-3 sm:px-5 py-2 text-[10px] sm:text-xs text-gray-400 uppercase tracking-wide">
          <div className="col-span-4">Player</div>
          <div className="col-span-2 text-center">Pos</div>
          <div className="col-span-2 text-center">Score</div>
          <div className="col-span-2 text-center">Thru</div>
          <div className="col-span-2 text-center">Today</div>
        </div>

        {activePlayers.map((player) => (
          <div
            key={player.name}
            className="grid grid-cols-12 px-3 sm:px-5 py-2.5 items-center hover:bg-gray-50 transition-colors"
          >
            <div className="col-span-4 text-xs sm:text-sm font-medium text-gray-800 truncate">
              {player.name}
            </div>
            <div
              className={`col-span-2 text-center text-xs sm:text-sm font-medium tabular-nums ${getPositionStyle(
                player.position
              )}`}
            >
              {player.position}
            </div>
            <div
              className={`col-span-2 text-center text-xs sm:text-sm font-medium tabular-nums ${getScoreStyle(
                player.score
              )}`}
            >
              {player.score}
            </div>
            <div className="col-span-2 text-center text-xs sm:text-sm text-gray-500 tabular-nums">
              {player.thru}
            </div>
            <div
              className={`col-span-2 text-center text-xs sm:text-sm tabular-nums ${getScoreStyle(
                player.today
              )}`}
            >
              {player.today}
            </div>
          </div>
        ))}

        {wdPlayers.map((player) => (
          <div
            key={player.name}
            className="grid grid-cols-12 px-3 sm:px-5 py-2.5 items-center bg-red-50/50"
          >
            <div className="col-span-4 text-xs sm:text-sm text-gray-400 line-through truncate">
              {player.name}
            </div>
            <div className="col-span-2 text-center text-xs sm:text-sm font-medium text-red-500">
              {player.position}
            </div>
            <div className="col-span-2 text-center text-xs sm:text-sm text-gray-400">
              {player.score}
            </div>
            <div className="col-span-2 text-center text-xs sm:text-sm text-gray-400">
              {player.thru}
            </div>
            <div className="col-span-2 text-center text-xs sm:text-sm text-gray-400">
              {player.today}
            </div>
          </div>
        ))}
      </div>}
    </div>
  );
}

function LeaderboardTable({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="grid grid-cols-12 px-3 sm:px-5 py-2.5 border-b border-gray-100 text-[10px] sm:text-xs text-gray-400 uppercase tracking-wide">
        <div className="col-span-1 text-center">Pos</div>
        <div className="col-span-5 sm:col-span-5">Player</div>
        <div className="col-span-3 text-center">Score</div>
        <div className="col-span-3 text-center">Today</div>
      </div>
      <div className="divide-y divide-gray-50">
        {entries.map((entry) => {
          const isMcWd = entry.position === "MC" || entry.position === "WD";
          const thruDisplay = entry.thru !== "--" && entry.thru !== "F"
            ? `(${entry.thru})`
            : entry.thru === "F" ? "(F)" : "";
          return (
            <div
              key={entry.name}
              className={`grid grid-cols-12 px-3 sm:px-5 py-2 items-center ${
                entry.isPoolPlayer ? "bg-green-50/60" : ""
              } ${isMcWd ? "opacity-50" : ""}`}
            >
              <div className={`col-span-1 text-center text-xs sm:text-sm font-medium tabular-nums ${getPositionStyle(entry.position)}`}>
                {entry.position}
              </div>
              <div className={`col-span-5 sm:col-span-5 text-xs sm:text-sm truncate ${
                entry.isPoolPlayer ? "font-semibold text-gray-900" : "text-gray-700"
              }`}>
                {entry.name}
              </div>
              <div className={`col-span-3 text-center text-xs sm:text-sm font-medium tabular-nums ${getScoreStyle(entry.score)}`}>
                {entry.score}
              </div>
              <div className={`col-span-3 text-center text-xs sm:text-sm tabular-nums ${getScoreStyle(entry.today)}`}>
                {entry.today !== "--" ? `${entry.today} ${thruDisplay}` : "--"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────

export default function Leaderboard() {
  const [tab, setTab] = useState<"pool" | "leaderboard">("pool");
  const [teams, setTeams] = useState<TeamDisplay[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [tournamentStatus, setTournamentStatus] = useState(
    "Waiting for tournament to start"
  );
  const [currentRound, setCurrentRound] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const fetchScores = useCallback(async () => {
    try {
      const res = await fetch("/api/scores");
      if (!res.ok) throw new Error("API error");
      const data: APIResponse = await res.json();
      setTeams(data.teams);
      setLeaderboard(data.leaderboard || []);
      setTournamentStatus(data.status);
      setCurrentRound(data.round || null);
      setLastUpdated(data.updatedAt);
      setLoaded(true);
    } catch {
      // If API fails, show hardcoded data as fallback
      if (!loaded) {
        setTeams(
          POOL_DATA.teams.map((t) => ({
            id: t.id,
            owner: t.owner,
            players: t.players.map((name) => ({
              name,
              position: "--",
              score: "--",
              thru: "--",
              today: "--",
              isActive: true,
            })),
            totalPoints: 0,
            tiebreaker: 0,
          }))
        );
        setLoaded(true);
      }
    }
  }, [loaded]);

  useEffect(() => {
    fetchScores();
    // Poll every 5 minutes
    const interval = setInterval(fetchScores, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchScores]);

  if (!loaded) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Loading scores...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <TournamentHeader
          name={POOL_DATA.tournamentName}
          status={tournamentStatus}
          round={currentRound}
          lastUpdated={lastUpdated}
          isLive={teams.some((t) => t.players.some((p) => p.thru !== "--" && p.thru !== "F"))}
        />

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6">
          <button
            onClick={() => setTab("pool")}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === "pool"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Pool
          </button>
          <button
            onClick={() => setTab("leaderboard")}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === "leaderboard"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Leaderboard
          </button>
        </div>

        {/* Pool view */}
        {tab === "pool" && (
          <>
            <div className="space-y-4">
              {teams.map((team, i) => (
                <TeamCard key={team.id} team={team} rank={i + 1} />
              ))}
            </div>
            <div className="text-center mt-8">
              <p className="text-xs text-gray-400">
                Points = sum of player positions (lower is better) &middot; Updates
                every 5 min
              </p>
            </div>
          </>
        )}

        {/* Leaderboard view */}
        {tab === "leaderboard" && (
          <>
            <LeaderboardTable entries={leaderboard} />
            <div className="text-center mt-4">
              <p className="text-xs text-gray-400">
                Pool players highlighted in green
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
