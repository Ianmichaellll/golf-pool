import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

/**
 * POST /api/pools/[poolId]/finalize
 *
 * Admin-only. Snapshots the current standings + draft results into pool_history,
 * then marks the pool as "completed". Fetches final ESPN scores so the archive
 * is self-contained and no longer depends on live data.
 */

const ESPN_URL =
  "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard";

// ── Minimal ESPN types (same as scores route) ───────────────────────

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

// ── Helpers ──────────────────────────────────────────────────────────

function normalizeForMatch(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.\-']/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

function findEspnMatch(
  poolPlayerName: string,
  competitors: ESPNCompetitor[]
): ESPNCompetitor | null {
  const norm = normalizeForMatch(poolPlayerName);
  for (const c of competitors) {
    if (normalizeForMatch(c.athlete.displayName) === norm) return c;
    if (normalizeForMatch(c.athlete.fullName) === norm) return c;
  }
  const poolLast = norm.split(" ").pop() || "";
  if (poolLast.length > 2) {
    for (const c of competitors) {
      const espnLast = normalizeForMatch(c.athlete.displayName).split(" ").pop() || "";
      if (espnLast === poolLast) return c;
    }
  }
  return null;
}

// ── Route handler ───────────────────────────────────────────────────

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ poolId: string }> }
) {
  const { poolId } = await params;
  const supabase = await createClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch pool — must be admin and pool must be "active"
  const { data: pool } = await supabase
    .from("pools")
    .select("id, name, tournament, espn_event_id, admin_id, status, players_per_team, extras_count")
    .eq("id", poolId)
    .single();

  if (!pool) {
    return NextResponse.json({ error: "Pool not found" }, { status: 404 });
  }
  if (pool.admin_id !== user.id) {
    return NextResponse.json({ error: "Only the pool admin can finalize" }, { status: 403 });
  }
  if (pool.status === "completed") {
    return NextResponse.json({ error: "Pool is already completed" }, { status: 400 });
  }
  if (pool.status === "open") {
    return NextResponse.json({ error: "Pool hasn't been drafted yet" }, { status: 400 });
  }

  // Check if already archived
  const { data: existingHistory } = await supabase
    .from("pool_history")
    .select("id")
    .eq("pool_id", poolId)
    .maybeSingle();

  if (existingHistory) {
    return NextResponse.json({ error: "Pool already has archived results" }, { status: 400 });
  }

  // Fetch draft picks
  const { data: picks } = await supabase
    .from("draft_picks")
    .select("user_id, golfer_name, pick_number, round, is_auto")
    .eq("pool_id", poolId)
    .order("pick_number");

  // Fetch members + profiles
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
  for (const uid of userIds) teamPicks.set(uid, []);
  for (const pick of picks || []) {
    const arr = teamPicks.get(pick.user_id);
    if (arr) arr.push(pick.golfer_name);
  }

  // Fetch ESPN scores for final snapshot
  let competitors: ESPNCompetitor[] = [];
  let eventName = pool.tournament;

  if (pool.espn_event_id) {
    try {
      const res = await fetch(`${ESPN_URL}?event=${pool.espn_event_id}`, {
        headers: { "User-Agent": "EasyPool/1.0" },
      });
      if (res.ok) {
        const data = await res.json();
        const event: ESPNEvent | undefined = data.events?.[0];
        if (event?.competitions?.[0]) {
          competitors = event.competitions[0].competitors || [];
          eventName = event.name || event.shortName || pool.tournament;
        }
      }
    } catch (err) {
      console.error("ESPN fetch error during finalize:", err);
    }
  }

  const positionMap = computePositions(competitors);

  // Build final standings
  const teams = userIds.map((uid) => {
    const playerNames = teamPicks.get(uid) || [];
    const players = playerNames.map((name) => {
      const espn = findEspnMatch(name, competitors);
      if (!espn) {
        return { name, position: "--", score: "--", isActive: true };
      }
      const pos = positionMap.get(espn.athlete.displayName.toLowerCase()) || "--";
      return {
        name,
        position: pos,
        score: espn.score || "E",
        isActive: pos !== "WD" && pos !== "DQ" && pos !== "MC",
      };
    });

    let totalScore = 0;
    let positionSum = 0;
    for (const p of players) {
      const scoreNum = parseInt(p.score.replace("E", "0"));
      if (!isNaN(scoreNum)) totalScore += scoreNum;
      const posNum = parseInt(p.position.replace("T", ""));
      if (!isNaN(posNum)) {
        positionSum += posNum;
      } else if (p.position !== "--") {
        const espn = findEspnMatch(p.name, competitors);
        positionSum += espn?.order || 999;
      }
    }

    return {
      id: uid,
      owner: nameMap.get(uid) || "Unknown",
      players,
      totalScore,
      positionSum,
    };
  });

  teams.sort((a, b) => {
    if (a.totalScore !== b.totalScore) return a.totalScore - b.totalScore;
    return a.positionSum - b.positionSum;
  });

  // Build draft results snapshot
  const draftResults = (picks || []).map((p) => ({
    pick_number: p.pick_number,
    round: p.round,
    user_id: p.user_id,
    owner: nameMap.get(p.user_id) || "Unknown",
    golfer_name: p.golfer_name,
    is_auto: p.is_auto,
  }));

  // Insert into pool_history
  const { error: insertError } = await supabase.from("pool_history").insert({
    pool_id: poolId,
    tournament: eventName,
    final_standings: teams,
    draft_results: draftResults,
    completed_at: new Date().toISOString(),
  });

  if (insertError) {
    console.error("Failed to insert pool_history:", insertError);
    return NextResponse.json(
      { error: "Failed to save pool history" },
      { status: 500 }
    );
  }

  // Mark pool as completed
  await supabase
    .from("pools")
    .update({ status: "completed" })
    .eq("id", poolId);

  return NextResponse.json({
    success: true,
    message: "Pool finalized and archived",
    winner: teams[0]?.owner || "Unknown",
  });
}
