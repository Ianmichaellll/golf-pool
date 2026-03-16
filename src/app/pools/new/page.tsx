"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";

type Tournament = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
};

export default function CreatePoolPage() {
  const [name, setName] = useState("");
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [selectedEventName, setSelectedEventName] = useState("");
  const [numTeams, setNumTeams] = useState(8);
  const [playersPerTeam, setPlayersPerTeam] = useState(4);
  const [draftType, setDraftType] = useState<"snake" | "regular">("snake");
  const [extrasCount, setExtrasCount] = useState(0);
  const [timerSeconds, setTimerSeconds] = useState(120);
  const [draftDate, setDraftDate] = useState("");
  const [draftTime, setDraftTime] = useState("19:00");
  const [draftTimezone, setDraftTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingTournaments, setLoadingTournaments] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  // Fetch PGA Tour schedule from ESPN
  useEffect(() => {
    async function fetchTournaments() {
      try {
        const res = await fetch("/api/tournaments");
        const data = await res.json();
        if (data.tournaments?.length) {
          setTournaments(data.tournaments);
          // Default to the next upcoming tournament
          const now = new Date();
          const upcoming = data.tournaments.find(
            (t: Tournament) => new Date(t.endDate) >= now
          );
          if (upcoming) {
            setSelectedEventId(upcoming.id);
            setSelectedEventName(upcoming.name);
          } else {
            setSelectedEventId(data.tournaments[0].id);
            setSelectedEventName(data.tournaments[0].name);
          }
        }
      } catch (err) {
        console.error("Failed to load tournaments:", err);
      } finally {
        setLoadingTournaments(false);
      }
    }
    fetchTournaments();
  }, []);

  function handleTournamentChange(eventId: string) {
    setSelectedEventId(eventId);
    const t = tournaments.find((t) => t.id === eventId);
    if (t) setSelectedEventName(t.name);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");

      let draft_start_time: string | null = null;
      if (draftDate && draftTime) {
        const dt = new Date(`${draftDate}T${draftTime}`);
        draft_start_time = dt.toISOString();
      }

      const { data: pool, error: poolErr } = await supabase
        .from("pools")
        .insert({
          name,
          tournament: selectedEventName,
          espn_event_id: selectedEventId,
          admin_id: user.id,
          num_teams: numTeams,
          players_per_team: playersPerTeam,
          draft_type: draftType,
          extras_count: extrasCount,
          timer_seconds: timerSeconds,
          draft_start_time,
        })
        .select()
        .single();

      if (poolErr) throw poolErr;

      const { error: memberErr } = await supabase
        .from("pool_members")
        .insert({ pool_id: pool.id, user_id: user.id });
      if (memberErr) throw memberErr;

      const { error: draftErr } = await supabase.from("drafts").insert({
        pool_id: pool.id,
        total_picks: numTeams * (playersPerTeam + extrasCount),
      });
      if (draftErr) throw draftErr;

      router.push(`/pools/${pool.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      console.error("Pool creation error:", err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <h1
        className="text-xl font-bold mb-6"
        style={{ color: "var(--gray-900)" }}
      >
        Create Pool
      </h1>

      <form onSubmit={handleCreate} className="space-y-5">
        {/* Pool Name */}
        <div>
          <label
            className="block text-sm font-medium mb-1"
            style={{ color: "var(--gray-700)" }}
          >
            Pool Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., The Boys Masters Pool"
            required
            className="w-full px-3 py-2 rounded-lg border text-sm"
            style={{ borderColor: "var(--gray-300)", background: "white" }}
          />
        </div>

        {/* Tournament */}
        <div>
          <label
            className="block text-sm font-medium mb-1"
            style={{ color: "var(--gray-700)" }}
          >
            Tournament
          </label>
          {loadingTournaments ? (
            <p className="text-sm" style={{ color: "var(--gray-400)" }}>
              Loading PGA Tour schedule...
            </p>
          ) : (
            <select
              value={selectedEventId}
              onChange={(e) => handleTournamentChange(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: "var(--gray-300)", background: "white" }}
            >
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({formatDate(t.startDate)})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Draft Type */}
        <div>
          <label
            className="block text-sm font-medium mb-2"
            style={{ color: "var(--gray-700)" }}
          >
            Draft Type
          </label>
          <div className="flex gap-3">
            {(["snake", "regular"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setDraftType(type)}
                className="flex-1 py-2 rounded-lg border text-sm font-medium transition-colors"
                style={{
                  borderColor:
                    draftType === type ? "var(--green)" : "var(--gray-300)",
                  background:
                    draftType === type ? "var(--green)" : "white",
                  color: draftType === type ? "white" : "var(--gray-700)",
                }}
              >
                {type === "snake" ? "Snake" : "Regular"}
              </button>
            ))}
          </div>
          <p className="text-xs mt-1" style={{ color: "var(--gray-400)" }}>
            {draftType === "snake"
              ? "Order reverses each round (1-8, 8-1, 1-8...)"
              : "Same order every round (1-8, 1-8, 1-8...)"}
          </p>
        </div>

        {/* Number of Teams */}
        <div>
          <label
            className="block text-sm font-medium mb-1"
            style={{ color: "var(--gray-700)" }}
          >
            Number of Teams
          </label>
          <select
            value={numTeams}
            onChange={(e) => setNumTeams(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-lg border text-sm"
            style={{ borderColor: "var(--gray-300)", background: "white" }}
          >
            {[2, 4, 6, 8, 10, 12].map((n) => (
              <option key={n} value={n}>
                {n} teams
              </option>
            ))}
          </select>
        </div>

        {/* Players Per Team */}
        <div>
          <label
            className="block text-sm font-medium mb-1"
            style={{ color: "var(--gray-700)" }}
          >
            Players Per Team
          </label>
          <select
            value={playersPerTeam}
            onChange={(e) => setPlayersPerTeam(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-lg border text-sm"
            style={{ borderColor: "var(--gray-300)", background: "white" }}
          >
            {[3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n} players
              </option>
            ))}
          </select>
        </div>

        {/* Extra Picks */}
        <div>
          <label
            className="block text-sm font-medium mb-1"
            style={{ color: "var(--gray-700)" }}
          >
            Extra Picks (for withdrawals)
          </label>
          <select
            value={extrasCount}
            onChange={(e) => setExtrasCount(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-lg border text-sm"
            style={{ borderColor: "var(--gray-300)", background: "white" }}
          >
            {[0, 1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n} extra{n !== 1 ? "s" : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Pick Timer */}
        <div>
          <label
            className="block text-sm font-medium mb-1"
            style={{ color: "var(--gray-700)" }}
          >
            Pick Timer
          </label>
          <select
            value={timerSeconds}
            onChange={(e) => setTimerSeconds(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-lg border text-sm"
            style={{ borderColor: "var(--gray-300)", background: "white" }}
          >
            <option value={60}>1 minute</option>
            <option value={90}>1.5 minutes</option>
            <option value={120}>2 minutes</option>
            <option value={180}>3 minutes</option>
            <option value={300}>5 minutes</option>
          </select>
        </div>

        {/* Draft Start Time */}
        <div>
          <label
            className="block text-sm font-medium mb-1"
            style={{ color: "var(--gray-700)" }}
          >
            Draft Start Time
          </label>
          <div className="flex gap-2">
            <input
              type="date"
              value={draftDate}
              onChange={(e) => setDraftDate(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: "var(--gray-300)", background: "white" }}
            />
            <input
              type="time"
              value={draftTime}
              onChange={(e) => setDraftTime(e.target.value)}
              className="w-28 px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: "var(--gray-300)", background: "white" }}
            />
          </div>
          <select
            value={draftTimezone}
            onChange={(e) => setDraftTimezone(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border text-sm mt-2"
            style={{ borderColor: "var(--gray-300)", background: "white" }}
          >
            <option value="America/New_York">Eastern (ET)</option>
            <option value="America/Chicago">Central (CT)</option>
            <option value="America/Denver">Mountain (MT)</option>
            <option value="America/Los_Angeles">Pacific (PT)</option>
            <option value="America/Anchorage">Alaska (AKT)</option>
            <option value="Pacific/Honolulu">Hawaii (HT)</option>
          </select>
          <p className="text-xs mt-1" style={{ color: "var(--gray-400)" }}>
            {draftDate
              ? `Draft scheduled for ${new Date(`${draftDate}T${draftTime}`).toLocaleString("en-US", { timeZone: draftTimezone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}`
              : "Leave blank to start manually from the lobby"}
          </p>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
            {error}
          </p>
        )}

        {/* Summary */}
        <div
          className="rounded-lg p-3 text-sm"
          style={{ background: "var(--gray-100)", color: "var(--gray-600)" }}
        >
          <p
            className="font-medium mb-1"
            style={{ color: "var(--gray-700)" }}
          >
            Summary
          </p>
          <p>
            {numTeams} teams drafting {playersPerTeam} players each (
            {draftType} draft)
          </p>
          <p>
            {numTeams * (playersPerTeam + extrasCount)} total picks,{" "}
            {timerSeconds}s per pick
          </p>
          {selectedEventName && <p>Tournament: {selectedEventName}</p>}
          {draftDate && (
            <p>
              Draft:{" "}
              {new Date(`${draftDate}T${draftTime}`).toLocaleString("en-US", {
                timeZone: draftTimezone,
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                timeZoneName: "short",
              })}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || !name || !selectedEventId}
          className="w-full py-2.5 rounded-lg text-white text-sm font-semibold"
          style={{
            background: "var(--green)",
            opacity: loading || !name || !selectedEventId ? 0.5 : 1,
          }}
        >
          {loading ? "Creating..." : "Create Pool"}
        </button>
      </form>
    </div>
  );
}
