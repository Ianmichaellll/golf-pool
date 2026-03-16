"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { loadPool, savePool } from "../lib/storage";

export default function Setup() {
  const router = useRouter();
  const [tournamentName, setTournamentName] = useState("The Players Championship");
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([
    { id: "1", name: "" },
    { id: "2", name: "" },
  ]);

  // Load existing config if editing
  useEffect(() => {
    const existing = loadPool();
    if (existing) {
      setTournamentName(existing.tournamentName);
      setTeams(
        existing.teams.map((t) => ({ id: t.id, name: t.owner }))
      );
    }
  }, []);

  function addTeam() {
    setTeams([...teams, { id: String(Date.now()), name: "" }]);
  }

  function removeTeam(id: string) {
    if (teams.length <= 2) return;
    setTeams(teams.filter((t) => t.id !== id));
  }

  function updateName(id: string, name: string) {
    setTeams(teams.map((t) => (t.id === id ? { ...t, name } : t)));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const filledTeams = teams.filter((t) => t.name.trim());
    if (filledTeams.length < 2) return;

    // Preserve existing player picks if editing
    const existing = loadPool();
    const existingTeamMap = new Map(
      existing?.teams.map((t) => [t.id, t.players]) ?? []
    );

    savePool({
      tournamentName: tournamentName.trim(),
      teams: filledTeams.map((t) => ({
        id: t.id,
        owner: t.name.trim(),
        players: existingTeamMap.get(t.id) ?? [],
      })),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    });

    router.push("/draft");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-1 text-center">
          Easy Pool Setup
        </h1>
        <p className="text-gray-500 text-sm text-center mb-8">
          Create your teams, then draft players
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Tournament name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tournament
            </label>
            <input
              type="text"
              value={tournamentName}
              onChange={(e) => setTournamentName(e.target.value)}
              placeholder="e.g. The Masters"
              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-600/20 focus:border-green-600 transition"
              required
            />
          </div>

          {/* Teams */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Teams
            </label>
            <div className="space-y-2">
              {teams.map((team, i) => (
                <div key={team.id} className="flex items-center gap-2">
                  <span className="w-6 text-xs text-gray-400 text-right shrink-0">
                    {i + 1}.
                  </span>
                  <input
                    type="text"
                    value={team.name}
                    onChange={(e) => updateName(team.id, e.target.value)}
                    placeholder={`Team ${i + 1} name`}
                    className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-600/20 focus:border-green-600 transition"
                  />
                  {teams.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeTeam(team.id)}
                      className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                    >
                      &times;
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addTeam}
              className="mt-3 text-sm text-green-700 hover:text-green-800 font-medium transition"
            >
              + Add team
            </button>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={teams.filter((t) => t.name.trim()).length < 2}
            className="w-full py-3 bg-green-700 text-white rounded-xl font-medium text-sm hover:bg-green-800 disabled:bg-gray-200 disabled:text-gray-400 transition"
          >
            Next: Draft Players
          </button>
        </form>

        {/* Link to leaderboard if pool exists */}
        {loadPool() && (
          <div className="mt-4 text-center">
            <button
              onClick={() => router.push("/")}
              className="text-sm text-gray-400 hover:text-gray-600 transition"
            >
              Back to leaderboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
