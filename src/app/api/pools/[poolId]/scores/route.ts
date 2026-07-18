import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

const ESPN_URL =
  "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard";

// ── ESPN types ─────────────────────────────────────────────────────

type ESPNLinescore = {
  period: number;
  value: number;
  displayValue: string;
  linescores?: { period: number; value: number; displayValue: string; scoreType?: { displayValue?: string } }[];
};

type ESPNCompetitor = {
  id?: string;
  order: number;
  score: string;
  athlete: { displayName: string; fullName: string };
  linescores?: ESPNLinescore[];
  status?: { displayValue?: string; type?: { description?: string } };
};

type ESPNEvent = {
  id?: string;
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

function isMissedCut(c: ESPNCompetitor, currentRound: number = 1): boolean {
  const s = c.status?.type?.description?.toLowerCase() || "";
  if (s.includes("cut") || s === "mc" || c.score === "CUT" || c.score === "MC") return true;
  // MC players only have linescores up to round 3 (with value=0), not round 4
  // Active players always have a linescore entry for the current round
  if (currentRound > 2 && c.linescores?.length) {
    const maxPeriod = Math.max(...c.linescores.map((r) => r.period));
    if (maxPeriod < currentRound) {
      const completedRounds = c.linescores.filter((r) => r.value > 0).length;
      if (completedRounds === 2) return true;
    }
  }
  return false;
}

function isWithdrawn(c: ESPNCompetitor): boolean {
  const s = c.status?.type?.description?.toLowerCase() || "";
  return s === "wd" || s === "withdrawn" || c.score === "WD";
}

// Missed-cut score: every MC player counts as a FLAT +2, regardless of their
// actual cut score. The same +2 is shown each weekend day (Sat and Sun) — it
// does not use their real score and does not escalate.
const MC_WEEKEND_PENALTY = 2;
const MC_FLAT_SCORE = `+${MC_WEEKEND_PENALTY}`;

// Get a MC/WD player's actual score from their completed rounds
function getActualScore(c: ESPNCompetitor): string {
  // ESPN sometimes keeps the numeric score even for MC players
  const s = c.score;
  if (s && s !== "CUT" && s !== "MC" && s !== "WD") {
    return s;
  }
  // Fall back to summing round scores from linescores
  if (!c.linescores?.length) return "--";
  let total = 0;
  let hasData = false;
  for (const round of c.linescores) {
    if (round.value) {
      // round.value is strokes for the round, convert to relative par
      // round.displayValue is relative to par (e.g. "+3", "-1", "E")
      const display = round.displayValue;
      if (display) {
        const num = parseInt(display.replace("E", "0"));
        if (!isNaN(num)) {
          total += num;
          hasData = true;
        }
      }
    }
  }
  if (!hasData) return "--";
  if (total === 0) return "E";
  return total > 0 ? `+${total}` : String(total);
}

function buildScorecard(c: ESPNCompetitor): { round: number; score: string; holes: { hole: number; score: number; par: number; toPar: number }[] }[] {
  if (!c.linescores?.length) return [];
  return c.linescores
    .filter((r) => r.linescores && r.linescores.length > 0)
    .map((r) => ({
      round: r.period,
      score: r.displayValue || "--",
      holes: (r.linescores || []).map((h) => {
        // scoreType.displayValue gives relative to par: "E", "-1", "+1", "-2", etc.
        const relToPar = parseInt((h.scoreType?.displayValue || "E").replace("E", "0"));
        const toPar = isNaN(relToPar) ? 0 : relToPar;
        const par = h.value - toPar;
        return { hole: h.period, score: h.value, par, toPar };
      }),
    }));
}

function computePositions(competitors: ESPNCompetitor[], currentRound: number = 1): Map<string, string> {
  const positions = new Map<string, string>();
  const active: ESPNCompetitor[] = [];

  for (const c of competitors) {
    const key = c.athlete.displayName.toLowerCase();
    if (isMissedCut(c, currentRound)) {
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
        // 30s cache: ESPN updates leaderboard roughly every 60-90s during live
        // play, so 30s keeps us close to fresh without hammering them. Combine
        // with 60s client poll = worst-case ~90s behind ESPN.
        next: { revalidate: 30 },
      });
      if (res.ok) {
        const data = await res.json();
        // ESPN returns ALL concurrently-running events in one response (e.g. The Open
        // and a same-week US event), and does NOT reliably put the requested one first
        // — the ?event= param is best-effort. Trusting events[0] means that whenever
        // ESPN floats the *other* tournament to the front, isCorrectEvent fails and the
        // standings blank out ("not updating"). This bites overseas majors especially,
        // since their rounds finish while the US event is still live. So: find OUR event
        // by id among ALL returned events, with a tournament-name fallback for a stale id.
        const events: ESPNEvent[] = data.events || [];
        let event = events.find(
          (e) => String(e.id) === String(pool.espn_event_id)
        );
        if (!event) {
          event = events.find(
            (e) =>
              normalizeForMatch(e.name || e.shortName || "") ===
              normalizeForMatch(pool.tournament)
          );
        }
        if (event?.competitions?.[0]) {
          competitors = event.competitions[0].competitors || [];
          eventName = event.name || event.shortName || pool.tournament;
          eventStatus =
            event.status?.type?.description ||
            event.competitions[0].status?.type?.description ||
            "In Progress";
          currentRound = getTournamentRound(competitors);
        } else {
          // Our event isn't in ESPN's response at all — hasn't started on ESPN yet
          eventStatus = "Scheduled";
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
    ? computePositions(competitors, currentRound)
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
  const fieldSize = competitors.length;
  const playersPerTeam = pool.players_per_team;
  const extrasCount = pool.extras_count;

  const teams = userIds.map((uid) => {
    const allNames = teamPicks.get(uid) || [];

    // Split into starters (first N picks) and extras (remaining)
    const starterNames = allNames.slice(0, playersPerTeam);
    const extraNames = allNames.slice(playersPerTeam);

    // Build player data for all picks
    function buildPlayer(name: string) {
      const espn = findEspnMatch(name);
      if (!espn) {
        return { name, espnId: 0, position: "--", score: "--", thru: "--", today: "--", scorecard: [] as ReturnType<typeof buildScorecard>, isActive: true, isWD: false, isMC: false, isExtra: false, countsForScore: false };
      }
      const pos = positionMap.get(espn.athlete.displayName.toLowerCase()) || "--";
      const mc = pos === "MC";
      const wd = pos === "WD" || pos === "DQ";

      let score = "--";
      if (tournamentStarted) {
        if (mc) {
          // Missed-cut players count as a flat +2, ignoring their actual score.
          // Same +2 every weekend day. Drives both display and team total.
          score = MC_FLAT_SCORE;
        } else if (wd) {
          score = getActualScore(espn);
        } else {
          score = espn.score || "E";
        }
      }

      return {
        name,
        espnId: parseInt(espn.id || "0", 10),
        position: pos,
        score,
        thru: tournamentStarted ? (mc ? "MC" : wd ? "WD" : getThru(espn, currentRound)) : "--",
        today: tournamentStarted ? (mc || wd ? "--" : getTodayScore(espn, currentRound)) : "--",
        scorecard: tournamentStarted ? buildScorecard(espn) : [],
        isActive: !mc && !wd,
        isWD: wd,
        isMC: mc,
        isExtra: false,
        countsForScore: false,
      };
    }

    const starters = starterNames.map(buildPlayer);
    const extras = extraNames.map((name) => {
      const p = buildPlayer(name);
      p.isExtra = true;
      return p;
    });

    // Determine which players count for scoring:
    // - Active starters always count
    // - WD starters are replaced by extras (in draft order)
    // - MC starters still count (they keep their 2-round score)
    const scoringPlayers: typeof starters = [];
    let extraIdx = 0;

    for (const starter of starters) {
      if (starter.isWD && extrasCount > 0) {
        // WD starter: find next available extra who is not also WD
        let replaced = false;
        while (extraIdx < extras.length) {
          const extra = extras[extraIdx];
          extraIdx++;
          if (!extra.isWD) {
            extra.isExtra = false; // promoted to active
            extra.countsForScore = true;
            scoringPlayers.push(extra);
            replaced = true;
            break;
          }
        }
        if (!replaced) {
          // No available extras — WD starter counts with their score
          starter.countsForScore = true;
          scoringPlayers.push(starter);
        }
      } else {
        starter.countsForScore = true;
        scoringPlayers.push(starter);
      }
    }

    // Combined score from scoring players only
    let totalScore = 0;
    let positionSum = 0;
    for (const p of scoringPlayers) {
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

    // Build final player list: scoring players first (sorted by score), then WD starters, then unused extras
    const wdStarters = starters.filter((s) => s.isWD && !s.countsForScore);
    const unusedExtras = extras.filter((e) => e.isExtra);

    scoringPlayers.sort((a, b) => {
      const scoreA = parseInt(a.score.replace("E", "0"));
      const scoreB = parseInt(b.score.replace("E", "0"));
      if (isNaN(scoreA)) return 1;
      if (isNaN(scoreB)) return -1;
      return scoreA - scoreB;
    });

    const allPlayers = [
      ...scoringPlayers,
      ...wdStarters.map((p) => ({ ...p, position: "WD" })),
      ...unusedExtras.map((p) => ({ ...p, isExtra: true })),
    ];

    return {
      id: uid,
      owner: nameMap.get(uid) || "Unknown",
      players: allPlayers.map((p) => ({
        name: p.name,
        espnId: p.espnId,
        position: p.position,
        score: p.score,
        thru: p.thru,
        today: p.today,
        scorecard: p.scorecard,
        isActive: p.isActive,
        isExtra: p.isExtra,
        countsForScore: p.countsForScore,
      })),
      totalScore,
      positionSum,
    };
  });

  // Sort teams by combined score (lowest wins), position sum breaks ties
  teams.sort((a, b) => {
    if (a.totalScore !== b.totalScore) return a.totalScore - b.totalScore;
    return a.positionSum - b.positionSum;
  });

  // 6. Build full leaderboard
  const leaderboard = competitors.map((c) => {
    const pos = positionMap.get(c.athlete.displayName.toLowerCase()) || "--";
    const isPoolPlayer =
      allPoolPlayers.has(normalizeForMatch(c.athlete.displayName)) ||
      allPoolPlayers.has(normalizeForMatch(c.athlete.fullName));
    return {
      name: c.athlete.displayName,
      espnId: parseInt(c.id || "0", 10),
      position: tournamentStarted ? pos : "--",
      score: tournamentStarted ? (c.score || "E") : "--",
      today: tournamentStarted ? getTodayScore(c, currentRound) : "--",
      thru: tournamentStarted ? getThru(c, currentRound) : "--",
      scorecard: tournamentStarted ? buildScorecard(c) : [],
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
