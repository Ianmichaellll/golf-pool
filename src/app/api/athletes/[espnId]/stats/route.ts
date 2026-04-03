import { NextRequest, NextResponse } from "next/server";

const ESPN_BASE =
  "https://site.web.api.espn.com/apis/common/v3/sports/golf/pga/athletes";

const EMPTY = { wins: "--", top10s: "--", scoringAvg: "--", earnings: "--", birthDate: "", birthPlace: "--", college: "--", age: "--" };

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ espnId: string }> }
) {
  const { espnId } = await params;

  try {
    // Fetch stats (overview) and bio (profile) in parallel — same base, different paths
    const [overviewRes, profileRes] = await Promise.all([
      fetch(`${ESPN_BASE}/${espnId}/overview`, {
        headers: { "User-Agent": "GolfPool/1.0" },
        next: { revalidate: 3600 },
      }),
      fetch(`${ESPN_BASE}/${espnId}`, {
        headers: { "User-Agent": "GolfPool/1.0" },
        next: { revalidate: 86400 },
      }),
    ]);

    // Parse season statistics from overview
    let wins = "--";
    let top10s = "--";
    let scoringAvg = "--";
    let earnings = "--";

    if (overviewRes.ok) {
      const data = await overviewRes.json();
      const stats = data.statistics;
      if (stats) {
        const labels: string[] = stats.labels || [];
        const statValues =
          stats.splits?.categories?.[0]?.stats ||
          stats.stats ||
          [];

        const labelMap = new Map<string, string>();
        labels.forEach((label: string, i: number) => {
          const val = statValues[i];
          if (val) {
            labelMap.set(
              label.toUpperCase(),
              val.displayValue ?? String(val.value ?? "")
            );
          }
        });

        wins = labelMap.get("WINS") || "--";
        top10s = labelMap.get("TOP10") || "--";
        scoringAvg = labelMap.get("AVG") || "--";
        earnings = labelMap.get("EARNINGS") || "--";
      }
    }

    // Parse bio data from profile endpoint
    // ESPN structure: { athlete: { displayDOB, age, birthPlace: {city,state,country}, college: {name} } }
    let dob = "";
    let birthPlace = "--";
    let college = "--";
    let age = "--";

    if (profileRes.ok) {
      const profile = await profileRes.json();
      const athlete = profile.athlete || profile;

      dob = athlete.displayDOB || "";
      age = athlete.age ? String(athlete.age) : "--";

      const bp = athlete.birthPlace;
      if (bp) {
        birthPlace = athlete.displayBirthPlace || [bp.city, bp.state, bp.country].filter(Boolean).join(", ") || "--";
      }
      college = athlete.college?.name || athlete.college?.shortName || "--";
    }

    return NextResponse.json(
      { wins, top10s, scoringAvg, earnings, birthDate: dob, birthPlace, college, age },
      { headers: { "Cache-Control": "public, max-age=3600" } }
    );
  } catch (err) {
    console.error("Athlete stats error:", err);
    return NextResponse.json(
      EMPTY,
      { headers: { "Cache-Control": "public, max-age=600" } }
    );
  }
}
