"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { loadPool, savePool } from "../lib/storage";

const PLAYERS_PER_TEAM = 4;

export default function Draft() {
  const router = useRouter();
  const [pool, setPool] = useState<ReturnType<typeof loadPool>>(null);
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const config = loadPool();
    if (!config || config.teams.length === 0) {
      router.push("/setup");
      return;
    }
    setPool(config);

    // Pre-fill existing picks
    const existing: Record<string, string[]> = {};
    config.teams.forEach((t) => {
      const padded = [...t.players];
      while (padded.length < PLAYERS_PER_TEAM) padded.push("");
      existing[t.id] = padded;
    });
    setPicks(existing);
    setLoaded(true);
  }, [router]);

  function updatePick(teamId: string, index: number, value: string) {
    setPicks((prev) => {
      const teamPicks = [...(prev[teamId] || Array(PLAYERS_PER_TEAM).fill(""))];
      teamPicks[index] = value;
      return { ...prev, [teamId]: teamPicks };
    });
  }

  function allPicked(): boolean {
    if (!pool) return false;
    return pool.teams.every((t) => {
      const teamPicks = picks[t.id] || [];
      return teamPicks.filter((p) => p.trim()).length === PLAYERS_PER_TEAM;
    });
  }

  function handleSave() {
    if (!pool) return;

    savePool({
      ...pool,
      teams: pool.teams.map((t) => ({
        ...t,
        players: (picks[t.id] || []).map((p) => p.trim()).filter(Boolean),
      })),
    });

    router.push("/");
  }

  // Get all players already picked (for duplicate detection)
  function getAllPicked(excludeTeamId: string, excludeIndex: number): Set<string> {
    const all = new Set<string>();
    Object.entries(picks).forEach(([teamId, players]) => {
      players.forEach((p, i) => {
        if (p.trim() && !(teamId === excludeTeamId && i === excludeIndex)) {
          all.add(p.trim().toLowerCase());
        }
      });
    });
    return all;
  }

  if (!loaded) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-1 text-center">
          Draft Players
        </h1>
        <p className="text-gray-500 text-sm text-center mb-2">
          {pool?.tournamentName}
        </p>
        <p className="text-gray-400 text-xs text-center mb-8">
          4 players per team
        </p>

        <div className="space-y-6">
          {pool?.teams.map((team) => {
            const teamPicks = picks[team.id] || Array(PLAYERS_PER_TEAM).fill("");

            return (
              <div
                key={team.id}
                className="bg-white border border-gray-200 rounded-xl overflow-hidden"
              >
                {/* Team header */}
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div className="font-semibold text-gray-900">
                    {team.owner}
                  </div>
                  <div className="text-xs text-gray-400">
                    {teamPicks.filter((p) => p.trim()).length}/{PLAYERS_PER_TEAM} picked
                  </div>
                </div>

                {/* Player inputs */}
                <div className="p-4 space-y-2">
                  {teamPicks.map((player, i) => {
                    const isDuplicate =
                      player.trim() &&
                      getAllPicked(team.id, i).has(player.trim().toLowerCase());

                    return (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-6 text-xs text-right shrink-0 text-gray-400">
                          {i + 1}.
                        </span>
                        <input
                          type="text"
                          value={player}
                          onChange={(e) =>
                            updatePick(team.id, i, e.target.value)
                          }
                          placeholder={`Player ${i + 1}`}
                          className={`flex-1 px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 transition ${
                            isDuplicate
                              ? "border-red-300 bg-red-50 text-red-700 focus:ring-red-200 focus:border-red-400"
                              : "border-gray-200 bg-white text-gray-900 focus:ring-green-600/20 focus:border-green-600"
                          }`}
                        />
                        {isDuplicate && (
                          <span className="text-xs text-red-500 shrink-0">
                            Taken
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="mt-8 space-y-3">
          <button
            onClick={handleSave}
            disabled={!allPicked()}
            className="w-full py-3 bg-green-700 text-white rounded-xl font-medium text-sm hover:bg-green-800 disabled:bg-gray-200 disabled:text-gray-400 transition"
          >
            Save & View Leaderboard
          </button>

          <div className="flex justify-center gap-6">
            <button
              onClick={() => router.push("/setup")}
              className="text-sm text-gray-400 hover:text-gray-600 transition"
            >
              Edit teams
            </button>
            <button
              onClick={() => {
                if (!pool) return;
                // Save partial progress
                savePool({
                  ...pool,
                  teams: pool.teams.map((t) => ({
                    ...t,
                    players: (picks[t.id] || [])
                      .map((p) => p.trim())
                      .filter(Boolean),
                  })),
                });
                alert("Progress saved!");
              }}
              className="text-sm text-gray-400 hover:text-gray-600 transition"
            >
              Save progress
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
