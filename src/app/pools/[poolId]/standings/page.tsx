"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";

// ── Types ───────────────────────────────────────────────────────────

type ScorecardRound = {
  round: number;
  score: string;
  holes: { hole: number; score: number; par: number; toPar: number }[];
};

type PlayerDisplay = {
  name: string;
  espnId?: number;
  position: string;
  score: string;
  thru?: string;
  today?: string;
  scorecard?: ScorecardRound[];
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
  espnId?: number;
  position: string;
  score: string;
  today: string;
  thru: string;
  scorecard?: ScorecardRound[];
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

type PlayerBio = {
  wins: string;
  top10s: string;
  scoringAvg: string;
  earnings: string;
  birthDate: string;
  birthPlace: string;
  college: string;
  age: string;
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

function headshotUrl(espnId: number): string {
  return `https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/${espnId}.png&w=96&h=70&cb=1`;
}

function getHoleScoreClasses(toPar: number): string {
  if (toPar <= -2) return "rounded-full bg-green-200 text-green-900"; // eagle+
  if (toPar === -1) return "rounded-full bg-green-100 text-green-800"; // birdie
  if (toPar === 1) return "rounded-sm bg-red-100 text-red-800"; // bogey
  if (toPar >= 2) return "rounded-sm bg-red-200 text-red-900"; // double+
  return ""; // par
}

// ── Scorecard Component ─────────────────────────────────────────────

function ScorecardView({ scorecard }: { scorecard: ScorecardRound[] }) {
  const [selectedRound, setSelectedRound] = useState(scorecard.length > 0 ? scorecard[scorecard.length - 1].round : 1);
  const round = scorecard.find((r) => r.round === selectedRound);

  if (!scorecard.length) {
    return (
      <div className="px-4 py-3 text-xs text-center" style={{ color: "var(--gray-400)" }}>
        No scorecard data available
      </div>
    );
  }

  const front9 = round?.holes.filter((h) => h.hole <= 9) || [];
  const back9 = round?.holes.filter((h) => h.hole > 9) || [];

  const front9Total = front9.reduce((sum, h) => sum + h.score, 0);
  const back9Total = back9.reduce((sum, h) => sum + h.score, 0);
  const front9Par = front9.reduce((sum, h) => sum + h.par, 0);
  const back9Par = back9.reduce((sum, h) => sum + h.par, 0);

  return (
    <div>
      {/* Round selector */}
      {scorecard.length > 1 && (
        <div className="flex gap-1 px-4 pt-3 pb-1">
          {scorecard.map((r) => (
            <button
              key={r.round}
              onClick={(e) => { e.stopPropagation(); setSelectedRound(r.round); }}
              className="px-2.5 py-1 text-[10px] font-semibold rounded-md transition-colors"
              style={{
                background: selectedRound === r.round ? "var(--green)" : "var(--gray-100)",
                color: selectedRound === r.round ? "white" : "var(--gray-500)",
              }}
            >
              R{r.round} ({r.score})
            </button>
          ))}
        </div>
      )}

      {round && (
        <div className="px-3 py-2 overflow-x-auto">
          {/* Front 9 */}
          <table className="w-full text-[10px] sm:text-xs tabular-nums" style={{ minWidth: 320 }}>
            <thead>
              <tr style={{ color: "var(--gray-400)" }}>
                <td className="font-semibold py-1 pr-1">Hole</td>
                {[1,2,3,4,5,6,7,8,9].map((h) => (
                  <td key={h} className="text-center w-7 py-1">{h}</td>
                ))}
                <td className="text-center font-semibold py-1 pl-1">Out</td>
              </tr>
            </thead>
            <tbody>
              <tr style={{ color: "var(--gray-500)" }}>
                <td className="font-semibold py-1 pr-1" style={{ color: "var(--gray-400)" }}>Par</td>
                {[1,2,3,4,5,6,7,8,9].map((h) => {
                  const hole = front9.find((ho) => ho.hole === h);
                  return <td key={h} className="text-center py-1">{hole ? hole.par : "-"}</td>;
                })}
                <td className="text-center font-semibold py-1 pl-1">{front9Par || "-"}</td>
              </tr>
              <tr>
                <td className="font-semibold py-1.5 pr-1" style={{ color: "var(--gray-400)" }}>Score</td>
                {[1,2,3,4,5,6,7,8,9].map((h) => {
                  const hole = front9.find((ho) => ho.hole === h);
                  if (!hole) return <td key={h} className="text-center py-1.5" style={{ color: "var(--gray-300)" }}>-</td>;
                  return (
                    <td key={h} className="text-center py-1.5">
                      <span className={`inline-flex items-center justify-center w-5 h-5 text-[10px] sm:text-xs font-semibold ${getHoleScoreClasses(hole.toPar)}`}>
                        {hole.score}
                      </span>
                    </td>
                  );
                })}
                <td className="text-center font-bold py-1.5 pl-1" style={{ color: "var(--gray-900)" }}>{front9Total || "-"}</td>
              </tr>
            </tbody>
          </table>

          {/* Back 9 */}
          <table className="w-full text-[10px] sm:text-xs tabular-nums mt-1" style={{ minWidth: 320 }}>
            <thead>
              <tr style={{ color: "var(--gray-400)" }}>
                <td className="font-semibold py-1 pr-1">Hole</td>
                {[10,11,12,13,14,15,16,17,18].map((h) => (
                  <td key={h} className="text-center w-7 py-1">{h}</td>
                ))}
                <td className="text-center font-semibold py-1 pl-1">In</td>
              </tr>
            </thead>
            <tbody>
              <tr style={{ color: "var(--gray-500)" }}>
                <td className="font-semibold py-1 pr-1" style={{ color: "var(--gray-400)" }}>Par</td>
                {[10,11,12,13,14,15,16,17,18].map((h) => {
                  const hole = back9.find((ho) => ho.hole === h);
                  return <td key={h} className="text-center py-1">{hole ? hole.par : "-"}</td>;
                })}
                <td className="text-center font-semibold py-1 pl-1">{back9Par || "-"}</td>
              </tr>
              <tr>
                <td className="font-semibold py-1.5 pr-1" style={{ color: "var(--gray-400)" }}>Score</td>
                {[10,11,12,13,14,15,16,17,18].map((h) => {
                  const hole = back9.find((ho) => ho.hole === h);
                  if (!hole) return <td key={h} className="text-center py-1.5" style={{ color: "var(--gray-300)" }}>-</td>;
                  return (
                    <td key={h} className="text-center py-1.5">
                      <span className={`inline-flex items-center justify-center w-5 h-5 text-[10px] sm:text-xs font-semibold ${getHoleScoreClasses(hole.toPar)}`}>
                        {hole.score}
                      </span>
                    </td>
                  );
                })}
                <td className="text-center font-bold py-1.5 pl-1" style={{ color: "var(--gray-900)" }}>{back9Total || "-"}</td>
              </tr>
            </tbody>
          </table>

          {/* Total */}
          {front9Total > 0 && back9Total > 0 && (
            <div className="flex justify-end mt-1 pr-1">
              <span className="text-xs font-bold" style={{ color: "var(--gray-900)" }}>
                Total: {front9Total + back9Total}
              </span>
              <span className="ml-2 text-xs" style={{ color: "var(--gray-500)" }}>
                ({round.score})
              </span>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

// ── Player Profile Component ────────────────────────────────────────

function PlayerProfile({ espnId }: { espnId: number }) {
  const [bio, setBio] = useState<PlayerBio | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!espnId) { setLoading(false); return; }
    fetch(`/api/athletes/${espnId}/stats`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        console.log(`[Profile ${espnId}]`, data);
        setBio(data);
      })
      .catch((err) => console.error(`[Profile ${espnId}] Error:`, err))
      .finally(() => setLoading(false));
  }, [espnId]);

  if (loading) {
    return (
      <div className="px-4 py-3 text-xs text-center" style={{ color: "var(--gray-400)" }}>
        Loading profile...
      </div>
    );
  }

  if (!bio) return null;

  // ESPN returns DD/MM/YYYY format — parse manually
  let birthDisplay = "--";
  if (bio.birthDate) {
    const parts = bio.birthDate.split("/");
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      birthDisplay = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    } else {
      birthDisplay = bio.birthDate;
    }
  }

  return (
    <div className="px-4 py-3 border-t" style={{ borderColor: "var(--gray-100)" }}>
      <div className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--gray-400)" }}>
        Profile
      </div>
      <div className="flex flex-col gap-1.5 text-xs">
        <div>
          <span style={{ color: "var(--gray-400)" }}>Age: </span>
          <span style={{ color: "var(--gray-700)" }}>{bio.age}</span>
        </div>
        <div>
          <span style={{ color: "var(--gray-400)" }}>College: </span>
          <span style={{ color: "var(--gray-700)" }}>{bio.college}</span>
        </div>
        <div>
          <span style={{ color: "var(--gray-400)" }}>Born: </span>
          <span style={{ color: "var(--gray-700)" }}>{birthDisplay}</span>
          {bio.birthPlace !== "--" && (
            <span style={{ color: "var(--gray-500)" }}> — {bio.birthPlace}</span>
          )}
        </div>
      </div>

      <div className="text-[10px] font-semibold uppercase tracking-wide mt-3 mb-2" style={{ color: "var(--gray-400)" }}>
        Season Stats
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Wins", value: bio.wins },
          { label: "Top 10s", value: bio.top10s },
          { label: "Scor Avg", value: bio.scoringAvg },
          { label: "Earnings", value: bio.earnings },
        ].map((stat) => (
          <div key={stat.label} className="text-center">
            <div className="text-sm font-semibold" style={{ color: "var(--gray-900)" }}>
              {stat.value}
            </div>
            <div className="text-[10px]" style={{ color: "var(--gray-400)" }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Expanded Panel with Tabs ────────────────────────────────────────

function ExpandedPlayerPanel({ espnId, scorecard }: { espnId: number; scorecard: ScorecardRound[] }) {
  const [activeTab, setActiveTab] = useState<"scorecard" | "profile">(scorecard.length > 0 ? "scorecard" : "profile");

  return (
    <div
      className="border-t"
      style={{ borderColor: "var(--gray-100)", background: "var(--gray-50)" }}
    >
      {/* Tab buttons */}
      <div className="flex gap-1 mx-3 mt-2 rounded-md p-0.5" style={{ background: "var(--gray-200)" }}>
        <button
          onClick={(e) => { e.stopPropagation(); setActiveTab("scorecard"); }}
          className="flex-1 py-1.5 text-[10px] sm:text-xs font-semibold rounded transition-colors"
          style={{
            background: activeTab === "scorecard" ? "white" : "transparent",
            color: activeTab === "scorecard" ? "var(--gray-900)" : "var(--gray-500)",
          }}
        >
          Scorecard
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setActiveTab("profile"); }}
          className="flex-1 py-1.5 text-[10px] sm:text-xs font-semibold rounded transition-colors"
          style={{
            background: activeTab === "profile" ? "white" : "transparent",
            color: activeTab === "profile" ? "var(--gray-900)" : "var(--gray-500)",
          }}
        >
          Profile
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "scorecard" && (
        <ScorecardView scorecard={scorecard} />
      )}
      {activeTab === "profile" && (
        <PlayerProfile espnId={espnId} />
      )}
    </div>
  );
}

// ── Expandable Player Row ───────────────────────────────────────────

function PlayerRow({
  player,
  isArchived,
  dimmed,
  strikethrough,
  bgStyle,
}: {
  player: PlayerDisplay;
  isArchived: boolean;
  dimmed?: boolean;
  strikethrough?: boolean;
  bgStyle?: React.CSSProperties;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasData = player.espnId && player.espnId > 0;

  return (
    <div style={bgStyle}>
      <button
        onClick={() => hasData && setExpanded(!expanded)}
        className={`w-full grid grid-cols-12 px-3 sm:px-5 py-2.5 items-center border-t ${hasData ? "cursor-pointer" : "cursor-default"}`}
        style={{ borderColor: "var(--gray-50)", opacity: dimmed ? 0.5 : 1 }}
      >
        <div
          className={`${isArchived ? "col-span-6" : "col-span-4"} flex items-center gap-2 text-left`}
        >
          {hasData && (
            <img
              src={headshotUrl(player.espnId!)}
              alt=""
              className="w-6 h-6 object-cover rounded-full flex-shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}
          <span
            className={`text-xs sm:text-sm font-medium truncate ${strikethrough ? "line-through" : ""}`}
            style={{ color: dimmed ? "var(--gray-400)" : strikethrough ? "var(--gray-400)" : "var(--gray-800)" }}
          >
            {player.name}
          </span>
          {hasData && (
            <svg
              className={`w-3 h-3 flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
              style={{ color: "var(--gray-300)" }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </div>
        <div
          className={`${isArchived ? "col-span-3" : "col-span-2"} text-center text-xs sm:text-sm tabular-nums ${
            strikethrough ? "font-medium text-red-500" : getPositionStyle(player.position)
          }`}
          style={!strikethrough ? { color: "var(--gray-700)" } : undefined}
        >
          {strikethrough ? "WD" : player.position}
        </div>
        <div
          className={`${isArchived ? "col-span-3" : "col-span-2"} text-center text-xs sm:text-sm font-medium tabular-nums ${getScoreStyle(player.score)}`}
          style={{ color: dimmed ? "var(--gray-400)" : "var(--gray-700)" }}
        >
          {player.score}
        </div>
        {!isArchived && (
          <div
            className="col-span-2 text-center text-xs sm:text-sm tabular-nums"
            style={{ color: dimmed ? "var(--gray-400)" : "var(--gray-500)" }}
          >
            {player.thru}
          </div>
        )}
        {!isArchived && (
          <div
            className={`col-span-2 text-center text-xs sm:text-sm tabular-nums ${getScoreStyle(player.today || "")}`}
            style={{ color: dimmed ? "var(--gray-400)" : "var(--gray-700)" }}
          >
            {player.today}
          </div>
        )}
      </button>

      {expanded && hasData && (
        <ExpandedPlayerPanel
          espnId={player.espnId!}
          scorecard={player.scorecard || []}
        />
      )}
    </div>
  );
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
            <PlayerRow key={player.name} player={player} isArchived={isArchived} />
          ))}

          {wdPlayers.length > 0 && (
            <div className="px-3 sm:px-5 pt-2 pb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-red-400">Withdrawn</span>
            </div>
          )}
          {wdPlayers.map((player) => (
            <PlayerRow
              key={player.name}
              player={player}
              isArchived={isArchived}
              strikethrough
              bgStyle={{ background: "rgba(239,68,68,0.04)" }}
            />
          ))}

          {benchPlayers.length > 0 && (
            <div className="px-3 sm:px-5 pt-2 pb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--gray-400)" }}>Alternates</span>
            </div>
          )}
          {benchPlayers.map((player) => (
            <PlayerRow key={player.name} player={player} isArchived={isArchived} dimmed />
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

// ── Leaderboard with expandable rows ────────────────────────────────

function LeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  const [expanded, setExpanded] = useState(false);
  const isMcWd = entry.position === "MC" || entry.position === "WD";
  const hasData = entry.espnId && entry.espnId > 0;
  const thruDisplay =
    entry.thru !== "--" && entry.thru !== "F"
      ? `(${entry.thru})`
      : entry.thru === "F"
        ? "(F)"
        : "";

  return (
    <div>
      <button
        onClick={() => hasData && setExpanded(!expanded)}
        className={`w-full grid grid-cols-12 px-3 sm:px-5 py-2 items-center border-t ${isMcWd ? "opacity-50" : ""} ${hasData ? "cursor-pointer" : "cursor-default"}`}
        style={{ borderColor: "var(--gray-50)", background: "white" }}
      >
        <div
          className="col-span-1 text-center text-xs sm:text-sm font-medium tabular-nums"
          style={{ color: "var(--gray-900)" }}
        >
          {entry.position}
        </div>
        <div
          className="col-span-5 text-xs sm:text-sm truncate text-left flex items-center gap-1"
          style={{ color: "var(--gray-900)" }}
        >
          {hasData && (
            <img
              src={headshotUrl(entry.espnId!)}
              alt=""
              className="w-6 h-6 object-cover rounded-full flex-shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}
          <span className="truncate">{entry.name}</span>
          {entry.isPoolPlayer && (
            <span className="text-[10px] flex-shrink-0" style={{ color: "var(--green)" }}>
              ●
            </span>
          )}
          {hasData && (
            <svg
              className={`w-3 h-3 flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
              style={{ color: "var(--gray-300)" }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
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
      </button>

      {expanded && hasData && (
        <ExpandedPlayerPanel
          espnId={entry.espnId!}
          scorecard={entry.scorecard || []}
        />
      )}
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
      {entries.map((entry) => (
        <LeaderboardRow key={entry.name} entry={entry} />
      ))}
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
          <div className="space-y-4">
            {history.teams.map((team, i) => (
              <TeamCard key={team.id} team={team} rank={i + 1} isArchived />
            ))}
          </div>
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
