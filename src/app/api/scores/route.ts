import { NextResponse } from "next/server";
import { POOL_DATA } from "../../lib/pool-data";

const ESPN_URL =
  "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard";

// Cache for 2 minutes to avoid hammering ESPN
let cache: { data: unknown; ts: number } | null = null;
const CACHE_TTL = 2 * 60 * 1000;

type ESPNHole = {
  period: number;
  value: number;
  displayValue: string;
};

type ESPNLinescore = {
  period: number;
  value: number;
  displayValue: string;
  linescores?: ESPNHole[];
};

type ESPNCompetitor = {
  order: number;
  score: string;
  athlete: {
    displayName: string;
    fullName: string;
    shortName: string;
  };
  linescores?: ESPNLinescore[];
  status?: {
    displayValue?: string;
    type?: { description?: string };
  };
};

type ESPNEvent = {
  name: string;
  shortName: string;
  competitions: {
    competitors: ESPNCompetitor[];
    status?: {
      type?: { description?: string; state?: string };
    };
  }[];
  status?: {
    type?: { description?: string; state?: string };
  };
};

type ESPNResponse = {
  events: ESPNEvent[];
};

// Build a set of all pool player names (lowercased) for matching
const POOL_PLAYERS = new Set(
  POOL_DATA.teams.flatMap((t) => t.players.map((p) => p.toLowerCase()))
);

function normalizeForMatch(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents (å→a, é→e, etc.)
    .toLowerCase()
    .replace(/[.\-']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findPoolMatch(espnName: string): string | null {
  const normalized = normalizeForMatch(espnName);
  for (const poolPlayer of POOL_PLAYERS) {
    if (normalizeForMatch(poolPlayer) === normalized) {
      return poolPlayer;
    }
  }
  // Try last-name matching as fallback
  const espnLast = normalized.split(" ").pop() || "";
  for (const poolPlayer of POOL_PLAYERS) {
    const poolLast = normalizeForMatch(poolPlayer).split(" ").pop() || "";
    if (espnLast === poolLast && espnLast.length > 2) {
      return poolPlayer;
    }
  }
  return null;
}

function getTournamentRound(competitors: ESPNCompetitor[]): number {
  // Determine the current round by finding the highest round any player has hole data for
  let maxRound = 1;
  for (const c of competitors) {
    if (!c.linescores) continue;
    for (const round of c.linescores) {
      if (round.linescores && round.linescores.length > 0 && round.period > maxRound) {
        maxRound = round.period;
      }
    }
  }
  return maxRound;
}

function getCurrentRoundData(competitor: ESPNCompetitor, tournamentRound: number): ESPNLinescore | null {
  if (!competitor.linescores || competitor.linescores.length === 0) return null;
  // Find the entry for the current tournament round
  const roundEntry = competitor.linescores.find(r => r.period === tournamentRound);
  if (!roundEntry) return null;
  // Only return if they have actual hole data for this round
  if (!roundEntry.linescores || roundEntry.linescores.length === 0) return null;
  return roundEntry;
}

function getThru(competitor: ESPNCompetitor, tournamentRound: number): string {
  const round = getCurrentRoundData(competitor, tournamentRound);
  if (!round) return "--";
  const holesPlayed = round.linescores!.length;
  return holesPlayed >= 18 ? "F" : String(holesPlayed);
}

function getTodayScore(competitor: ESPNCompetitor, tournamentRound: number): string {
  const round = getCurrentRoundData(competitor, tournamentRound);
  if (!round) return "--";
  return round.displayValue || "--";
}

function isMissedCut(competitor: ESPNCompetitor): boolean {
  // ESPN marks MC players with status or by having only 2 rounds
  // and being sorted to the bottom with no more rounds to play
  const statusDesc = competitor.status?.type?.description?.toLowerCase() || "";
  if (statusDesc.includes("cut") || statusDesc === "mc") return true;
  // Also check if score field contains "CUT" or similar
  if (competitor.score === "CUT" || competitor.score === "MC") return true;
  return false;
}

function isWithdrawn(competitor: ESPNCompetitor): boolean {
  const statusDesc = competitor.status?.type?.description?.toLowerCase() || "";
  return statusDesc === "wd" || statusDesc === "withdrawn" ||
    competitor.score === "WD";
}

function computePosition(
  competitors: ESPNCompetitor[]
): Map<string, string> {
  const positions = new Map<string, string>();

  // Separate active players from MC/WD
  const active: ESPNCompetitor[] = [];
  const inactive: ESPNCompetitor[] = [];

  for (const c of competitors) {
    if (isMissedCut(c)) {
      positions.set(c.athlete.displayName.toLowerCase(), "MC");
    } else if (isWithdrawn(c)) {
      positions.set(c.athlete.displayName.toLowerCase(), "WD");
    } else {
      active.push(c);
    }
  }

  // Rank active players
  let rank = 1;
  let i = 0;

  while (i < active.length) {
    const currentScore = active[i].score;
    let tied = 0;
    while (
      i + tied < active.length &&
      active[i + tied].score === currentScore
    ) {
      tied++;
    }

    for (let j = 0; j < tied; j++) {
      const name = active[i + j].athlete.displayName;
      const pos = tied > 1 ? `T${rank}` : String(rank);
      positions.set(name.toLowerCase(), pos);
    }

    rank += tied;
    i += tied;
  }

  return positions;
}

export async function GET() {
  // Return cache if fresh
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json(cache.data, {
      headers: { "Cache-Control": "public, max-age=120" },
    });
  }

  try {
    const res = await fetch(ESPN_URL, {
      headers: { "User-Agent": "GolfPool/1.0" },
      next: { revalidate: 120 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "ESPN API unavailable" },
        { status: 502 }
      );
    }

    const data: ESPNResponse = await res.json();
    const event = data.events?.[0];
    if (!event || !event.competitions?.[0]) {
      return NextResponse.json(
        { error: "No active event" },
        { status: 404 }
      );
    }

    const competition = event.competitions[0];
    const competitors = competition.competitors || [];
    const positionMap = computePosition(competitors);
    const currentRound = getTournamentRound(competitors);

    // Build player score map
    const playerScores: Record<
      string,
      { position: string; score: string; thru: string; today: string; order: number }
    > = {};

    for (const c of competitors) {
      const match = findPoolMatch(c.athlete.displayName);
      if (match) {
        const pos = positionMap.get(c.athlete.displayName.toLowerCase()) || "--";
        const mc = pos === "MC";
        const wd = pos === "WD" || pos === "DQ";

        // For MC/WD players, calculate actual score from round data
        let score = c.score || "E";
        if ((mc || wd) && (score === "CUT" || score === "MC" || score === "WD")) {
          let total = 0;
          let hasData = false;
          for (const round of c.linescores || []) {
            const num = parseInt((round.displayValue || "").replace("E", "0"));
            if (!isNaN(num)) { total += num; hasData = true; }
          }
          if (hasData) score = total === 0 ? "E" : total > 0 ? `+${total}` : String(total);
          else score = "--";
        }

        playerScores[match] = {
          position: pos,
          score,
          thru: mc ? "MC" : getThru(c, currentRound),
          today: mc ? "--" : getTodayScore(c, currentRound),
          order: c.order,
        };
      }
    }

    const fieldSize = competitors.length;

    // Build team results
    const teams = POOL_DATA.teams.map((team) => {
      const players = team.players.map((name) => {
        const scores = playerScores[name.toLowerCase()];
        return {
          name,
          position: scores?.position || "--",
          score: scores?.score || "--",
          thru: scores?.thru || "--",
          today: scores?.today || "--",
          isActive: scores?.position !== "WD" && scores?.position !== "DQ" && scores?.position !== "MC",
        };
      });

      // Combined score (lower is better, E=0, under par is negative)
      let totalScore = 0;
      // Position sum as tiebreaker (lower is better)
      let positionSum = 0;
      for (const p of players) {
        const scoreNum = parseInt(p.score.replace("E", "0"));
        if (!isNaN(scoreNum)) {
          totalScore += scoreNum;
        }
        if (p.position === "MC" || p.position === "WD" || p.position === "DQ") {
          positionSum += fieldSize;
        } else {
          const posNum = parseInt(p.position.replace("T", ""));
          if (!isNaN(posNum)) {
            positionSum += posNum;
          }
        }
      }

      // Sort players by score (best first)
      players.sort((a, b) => {
        const scoreA = parseInt(a.score.replace("E", "0"));
        const scoreB = parseInt(b.score.replace("E", "0"));
        if (isNaN(scoreA)) return 1;
        if (isNaN(scoreB)) return -1;
        return scoreA - scoreB;
      });

      return {
        id: team.id,
        owner: team.owner,
        players,
        totalScore,
        positionSum,
      };
    });

    // Sort teams by combined score (lowest wins), position sum breaks ties
    teams.sort((a, b) => {
      if (a.totalScore !== b.totalScore) return a.totalScore - b.totalScore;
      return a.positionSum - b.positionSum;
    });

    const eventStatus =
      event.status?.type?.description ||
      competition.status?.type?.description ||
      "In Progress";

    // Build full leaderboard for all competitors
    const leaderboard = competitors.map((c) => {
      const pos = positionMap.get(c.athlete.displayName.toLowerCase()) || "--";
      const thru = getThru(c, currentRound);
      const today = getTodayScore(c, currentRound);
      const isPoolPlayer = findPoolMatch(c.athlete.displayName) !== null;
      return {
        name: c.athlete.displayName,
        position: pos,
        score: c.score || "E",
        today,
        thru,
        isPoolPlayer,
      };
    });

    const result = {
      tournament: event.name,
      status: eventStatus,
      round: currentRound,
      teams,
      leaderboard,
      updatedAt: new Date().toISOString(),
    };

    cache = { data: result, ts: Date.now() };

    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, max-age=120" },
    });
  } catch (err) {
    console.error("ESPN fetch error:", err);
    return NextResponse.json(
      { error: "Failed to fetch scores" },
      { status: 500 }
    );
  }
}
