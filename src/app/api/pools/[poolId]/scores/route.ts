import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

const ESPN_URL =
  "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard";

// ── ESPN types ─────────────────────────────────────────────────────

type ESPNLinescore = {
  period: number;
  value: number;
  displayValue: string;
  linescores?: { period: number; value: number; displayValue: string }[];
};

type ESPNCompetitor = {
  order: number;
  score: string;
  athlete: { displayName: string; fullName: string };
  linescores?: ESPNLinescore[];
  status?: { displayValue?: string; type?: { description?: string } };
};

type ESPNEvent = {
  name: string;
  shortName: string;
  competitions: {
    competitors: ESPNCompetitor[];
    status?: { type?: { description?: string; state?: string } };
  }[];
  status?: { type?: { description?: string; state?: string } };
};

// ── Helpers ─────────────────────────────────────────────────────────

function normalizeForMatch(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.\-']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getTournamentRound(competitors: ESPNCompetitor[]): number {
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

function getThru(competitor: ESPNCompetitor, tournamentRound: number): string {
  const round = competitor.linescores?.find((r) => r.period === tournamentRound);
  if (!round?.linescores?.length) return "--";
  return round.linescores.length >= 18 ? "F" : String(round.linescores.length);
}

function getTodayScore(competitor: ESPNCompetitor, tournamentRound: number): string {
  const round = competitor.linescores?.find((r) => r.period === tournamentRound);
  if (!round?.linescores?.length) return "--";
  return round.displayValue || "--";
}

function isMissedCut(c: ESPNCompetitor): boolean {
  const s = c.status?.type?.description?.toLowerCase() || "";
  return s.includes("cut") || s === "mc" || c.score === "CUT" || c.score === "MC";
}

function isWithdrawn(c: ESPNCompetitor): boolean {
  const s = c.status?.type?.description?.toLowerCase() || "";
  return s === "wd" || s === "withdrawn" || c.score === "WD";
}

function computePositions(competitors: ESPNCompetitor[]): Map<string, string> {
  const positions = new Map<string, string>();
  const active: ESPNCompetitor[] = [];

  for (const c of competitors) {
    const key = c.athlete.displayName.toLowerCase();
    if (isMissedCut(c)) {
      positions.set(key, "MC");
    } else if (isWithdrawn(c)) {
      positions.set(key, "WD");
    } else {
      active.push(c);
    }
  }

  let rank = 1;
  let i = 0;
  while (i < active.length) {
    const currentScore = active[i].score;
    let tied = 0;
    while (i + tied < active.length && active[i + tied].score === currentScore) tied++;
    for (let j = 0; j < tied; j++) {
      const pos = tied > 1 ? `T${rank}` : String(rank);
      positions.set(active[i + j].athlete.displayName.toLowerCase(), pos);
    }
    rank += tied;
    i += tied;
  }

  return positions;
}

// ── Route handler ──────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ poolId: string }> }
) {
  const { poolId } = await params;
  const supabase = await createClient();

  // 1. Fetch pool details
  const { data: pool } = await supabase
    .from("pools")
    .select("id, name, tournament, espn_event_id, players_per_team, extras_count, draft_type, num_teams")
    .eq("id", poolId)
    .single();

  if (!pool) {
    return NextResponse.json({ error: "Pool not found" }, { status: 404 });
  }

  // 2. Fetch draft picks grouped by user
  const { data: draft } = await supabase
    .from("drafts")
    .select("id, status")
    .eq("pool_id", poolId)
    .single();

  if (!draft || draft.status === "pending") {
    return NextResponse.json({
      tournament: pool.tournament,
      status: "Draft not started",
      teams: [],
      leaderboard: [],
      updatedAt: new Date().toISOString(),
    });
  }

  const { data: picks } = await supabase
    .from("draft_picks")
    .select("user_id, golfer_name, pick_number, round")
    .eq("pool_id", poolId)
    .order("pick_number");

  // 3. Fetch member profiles
  const { data: members } = await supabase
    .from("pool_members")
    .select("user_id, draft_position")
    .eq("pool_id", poolId);

  const userIds = members?.map((m) => m.user_id) || [];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", userIds);

  const nameMap = new Map(profiles?.map((p) => [p.id, p.display_name]) || []);

  // Group picks by user
  const teamPicks = new Map<string, string[]>();
  for (const uid of userIds) {
    teamPicks.set(uid, []);
  }
  for (const pick of picks || []) {
    const arr = teamPicks.get(pick.user_id);
    if (arr) arr.push(pick.golfer_name);
  }

  // 4. Fetch ESPN scores for this event
  const allPoolPlayers = new Set(
    (picks || []).map((p) => normalizeForMatch(p.golfer_name))
  );

  let competitors: ESPNCompetitor[] = [];
  let eventName = pool.tournament;
  let eventStatus = "Scheduled";
  let currentRound = 1;

  if (pool.espn_event_id) {
    try {
      const espnUrl = `${ESPN_URL}?event=${pool.espn_event_id}`;
      const res = await fetch(espnUrl, {
        headers: { "User-Agent": "EasyPool/1.0" },
        next: { revalidate: 120 },
      });
      if (res.ok) {
        const data = await res.json();
        const event: ESPNEvent | undefined = data.events?.[0];
        if (event?.competitions?.[0]) {
          competitors = event.competitions[0].competitors || [];
          eventName = event.name || event.shortName || pool.tournament;
          eventStatus =
            event.status?.type?.description ||
            event.competitions[0].status?.type?.description ||
            "In Progress";
          currentRound = getTournamentRound(competitors);
        }
      }
    } catch (err) {
      console.error("ESPN fetch error:", err);
    }
  }

  // Check if tournament has actually started (any player has hole-by-hole data)
  const tournamentStarted = competitors.some(
    (c) => c.linescores?.some((r) => r.linescores && r.linescores.length > 0)
  );

  // Build position map — only if tournament has started
  const positionMap = tournamentStarted
    ? computePositions(competitors)
    : new Map<string, string>();

  // Match ESPN names to pool player names
  function findEspnMatch(poolPlayerName: string): ESPNCompetitor | null {
    const norm = normalizeForMatch(poolPlayerName);
    for (const c of competitors) {
      if (normalizeForMatch(c.athlete.displayName) === norm) return c;
      if (normalizeForMatch(c.athlete.fullName) === norm) return c;
    }
    // Last-name fallback
    const poolLast = norm.split(" ").pop() || "";
    if (poolLast.length > 2) {
      for (const c of competitors) {
        const espnLast = normalizeForMatch(c.athlete.displayName).split(" ").pop() || "";
        if (espnLast === poolLast) return c;
      }
    }
    return null;
  }

  // 5. Build team standings
  const teams = userIds.map((uid) => {
    const playerNames = teamPicks.get(uid) || [];
    const players = playerNames.map((name) => {
      const espn = findEspnMatch(name);
      if (!espn) {
        return { name, position: "--", score: "--", thru: "--", today: "--", isActive: true };
      }
      const pos = positionMap.get(espn.athlete.displayName.toLowerCase()) || "--";
      return {
        name,
        position: pos,
        score: tournamentStarted ? (espn.score || "E") : "--",
        thru: tournamentStarted ? getThru(espn, currentRound) : "--",
        today: tournamentStarted ? getTodayScore(espn, currentRound) : "--",
        isActive: pos !== "WD" && pos !== "DQ" && pos !== "MC",
      };
    });

    let totalPoints = 0;
    let tiebreaker = 0;
    for (const p of players) {
      const posNum = parseInt(p.position.replace("T", ""));
      if (!isNaN(posNum)) {
        totalPoints += posNum;
      } else if (p.position !== "--") {
        const espn = findEspnMatch(p.name);
        totalPoints += espn?.order || 999;
      }
      const scoreNum = parseInt(p.score.replace("E", "0"));
      if (!isNaN(scoreNum)) tiebreaker += scoreNum;
    }

    players.sort((a, b) => {
      const posA = parseInt(a.position.replace("T", "")) || 999;
      const posB = parseInt(b.position.replace("T", "")) || 999;
      return posA - posB;
    });

    return {
      id: uid,
      owner: nameMap.get(uid) || "Unknown",
      players,
      totalPoints,
      tiebreaker,
    };
  });

  teams.sort((a, b) => {
    if (a.totalPoints !== b.totalPoints) return a.totalPoints - b.totalPoints;
    return a.tiebreaker - b.tiebreaker;
  });

  // 6. Build full leaderboard
  const leaderboard = competitors.map((c) => {
    const pos = positionMap.get(c.athlete.displayName.toLowerCase()) || "--";
    const isPoolPlayer =
      allPoolPlayers.has(normalizeForMatch(c.athlete.displayName)) ||
      allPoolPlayers.has(normalizeForMatch(c.athlete.fullName));
    return {
      name: c.athlete.displayName,
      position: tournamentStarted ? pos : "--",
      score: tournamentStarted ? (c.score || "E") : "--",
      today: tournamentStarted ? getTodayScore(c, currentRound) : "--",
      thru: tournamentStarted ? getThru(c, currentRound) : "--",
      isPoolPlayer,
    };
  });

  return NextResponse.json(
    {
      tournament: eventName,
      poolName: pool.name,
      status: eventStatus,
      round: currentRound,
      draftStatus: draft.status,
      teams,
      leaderboard,
      updatedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "public, max-age=120" } }
  );
}
