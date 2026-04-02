import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

/**
 * GET /api/pools/[poolId]/history
 *
 * Returns archived pool results from pool_history.
 * Used by the standings page when a pool is completed.
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ poolId: string }> }
) {
  const { poolId } = await params;
  const supabase = await createClient();

  // Fetch pool basics
  const { data: pool } = await supabase
    .from("pools")
    .select("id, name, tournament, status, draft_type, num_teams, players_per_team")
    .eq("id", poolId)
    .single();

  if (!pool) {
    return NextResponse.json({ error: "Pool not found" }, { status: 404 });
  }

  // Fetch archived history
  const { data: history } = await supabase
    .from("pool_history")
    .select("tournament, final_standings, draft_results, completed_at")
    .eq("pool_id", poolId)
    .maybeSingle();

  if (!history) {
    return NextResponse.json({ error: "No archived results found" }, { status: 404 });
  }

  return NextResponse.json({
    poolName: pool.name,
    tournament: history.tournament,
    completedAt: history.completed_at,
    teams: history.final_standings,
    draftResults: history.draft_results,
    draftType: pool.draft_type,
    numTeams: pool.num_teams,
    playersPerTeam: pool.players_per_team,
  });
}
