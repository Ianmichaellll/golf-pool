"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { loadPool } from "./lib/storage";
import type { PoolConfig } from "./lib/types";

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
  isBackup: boolean;
  isActive: boolean;
};

type TeamDisplay = {
  id: string;
  owner: string;
  players: PlayerDisplay[];
  totalPoints: number;
  tiebreaker: number;
};

// ── Components ──────────────────────────────────────────────────────

function TournamentHeader({ name, status }: { name: string; status: string }) {
  return (
    <div className="text-center mb-8">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-1">
        Golf Pool
      </h1>
      <div className="text-gray-500 text-sm mb-4">{name}</div>
      <div className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-1.5 text-sm">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
        </span>
        <span className="text-gray-600">{status}</span>
      </div>
    </div>
  );
}

function TeamCard({ team, rank }: { team: TeamDisplay; rank: number }) {
  const activePlayers = team.players.filter((p) => p.isActive && !p.isBackup);
  const backupPlayer = team.players.find((p) => p.isBackup);
  const wdPlayers = team.players.filter((p) => !p.isActive && !p.isBackup);

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Team header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
              rank === 1
                ? "bg-green-700 text-white"
                : rank === 2
                ? "bg-gray-200 text-gray-700"
                : rank === 3
                ? "bg-amber-100 text-amber-800"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {rank}
          </div>
          <div>
            <div className="font-semibold text-gray-900">{team.owner}</div>
            <div className="text-xs text-gray-400">
              {activePlayers.length} active players
            </div>
          </div>
        </div>
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
      </div>

      {/* Players table */}
      <div className="divide-y divide-gray-50">
        <div className="grid grid-cols-12 px-5 py-2 text-xs text-gray-400 uppercase tracking-wide">
          <div className="col-span-5">Player</div>
          <div className="col-span-2 text-center">Pos</div>
          <div className="col-span-2 text-center">Score</div>
          <div className="col-span-1 text-center">Thru</div>
          <div className="col-span-2 text-center">Today</div>
        </div>

        {activePlayers.map((player) => (
          <div
            key={player.name}
            className="grid grid-cols-12 px-5 py-2.5 items-center hover:bg-gray-50 transition-colors"
          >
            <div className="col-span-5 text-sm font-medium text-gray-800 truncate">
              {player.name}
            </div>
            <div
              className={`col-span-2 text-center text-sm font-medium tabular-nums ${getPositionStyle(
                player.position
              )}`}
            >
              {player.position}
            </div>
            <div
              className={`col-span-2 text-center text-sm font-medium tabular-nums ${getScoreStyle(
                player.score
              )}`}
            >
              {player.score}
            </div>
            <div className="col-span-1 text-center text-sm text-gray-500 tabular-nums">
              {player.thru}
            </div>
            <div
              className={`col-span-2 text-center text-sm tabular-nums ${getScoreStyle(
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
            className="grid grid-cols-12 px-5 py-2.5 items-center bg-red-50/50"
          >
            <div className="col-span-5 text-sm text-gray-400 line-through truncate">
              {player.name}
            </div>
            <div className="col-span-2 text-center text-sm font-medium text-red-500">
              {player.position}
            </div>
            <div className="col-span-2 text-center text-sm text-gray-400">
              {player.score}
            </div>
            <div className="col-span-1 text-center text-sm text-gray-400">
              {player.thru}
            </div>
            <div className="col-span-2 text-center text-sm text-gray-400">
              {player.today}
            </div>
          </div>
        ))}

        {backupPlayer && (
          <div className="grid grid-cols-12 px-5 py-2.5 items-center bg-gray-50/80">
            <div className="col-span-5 text-sm text-gray-400 truncate">
              <span className="text-[10px] uppercase tracking-wide bg-gray-200 text-gray-500 rounded px-1.5 py-0.5 mr-2">
                ALT
              </span>
              {backupPlayer.name}
            </div>
            <div
              className={`col-span-2 text-center text-sm tabular-nums ${
                backupPlayer.position === "MC"
                  ? "text-red-400"
                  : "text-gray-400"
              }`}
            >
              {backupPlayer.position}
            </div>
            <div className="col-span-2 text-center text-sm text-gray-400 tabular-nums">
              {backupPlayer.score}
            </div>
            <div className="col-span-1 text-center text-sm text-gray-400 tabular-nums">
              {backupPlayer.thru}
            </div>
            <div className="col-span-2 text-center text-sm text-gray-400 tabular-nums">
              {backupPlayer.today}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Build display teams from saved config ───────────────────────────
// For now, positions/scores are placeholder until we wire up the API

function buildDisplayTeams(config: PoolConfig): TeamDisplay[] {
  return config.teams.map((t) => {
    const players: PlayerDisplay[] = t.players.map((name, i) => ({
      name,
      position: "--",
      score: "--",
      thru: "--",
      today: "--",
      isBackup: i === t.players.length - 1,
      isActive: true,
    }));

    return {
      id: t.id,
      owner: t.owner,
      players,
      totalPoints: 0,
      tiebreaker: 0,
    };
  });
}

// ── Main Page ───────────────────────────────────────────────────────

export default function Leaderboard() {
  const router = useRouter();
  const [pool, setPool] = useState<PoolConfig | null>(null);
  const [teams, setTeams] = useState<TeamDisplay[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const config = loadPool();
    if (!config || config.teams.length === 0) {
      router.push("/setup");
      return;
    }
    setPool(config);
    setTeams(buildDisplayTeams(config));
    setLoaded(true);
  }, [router]);

  if (!loaded) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  const sortedTeams = [...teams].sort((a, b) => {
    if (a.totalPoints !== b.totalPoints) return a.totalPoints - b.totalPoints;
    return a.tiebreaker - b.tiebreaker;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <TournamentHeader
          name={pool?.tournamentName ?? ""}
          status="Waiting for tournament to start"
        />

        {/* Standings */}
        <div className="space-y-4">
          {sortedTeams.map((team, i) => (
            <TeamCard key={team.id} team={team} rank={i + 1} />
          ))}
        </div>

        {/* Footer */}
        <div className="text-center mt-8 space-y-3">
          <p className="text-xs text-gray-400">
            Points = sum of player positions (lower is better)
          </p>
          <div className="flex justify-center gap-4">
            <button
              onClick={() => router.push("/setup")}
              className="text-sm text-gray-400 hover:text-gray-600 transition"
            >
              Edit teams
            </button>
            <button
              onClick={() => router.push("/draft")}
              className="text-sm text-gray-400 hover:text-gray-600 transition"
            >
              Edit picks
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
