import { NextRequest, NextResponse } from "next/server";

const ESPN_OVERVIEW_URL =
  "https://site.web.api.espn.com/apis/common/v3/sports/golf/pga/athletes";

const ESPN_PROFILE_URL =
  "https://site.api.espn.com/apis/site/v2/sports/golf/pga/athletes";

const EMPTY = { wins: "--", top10s: "--", scoringAvg: "--", earnings: "--", birthDate: "", birthPlace: "--", college: "--", age: "--" };

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ espnId: string }> }
) {
  const { espnId } = await params;

  try {
    // Fetch stats (overview) and bio (profile) in parallel
    const [overviewRes, profileRes] = await Promise.all([
      fetch(`${ESPN_OVERVIEW_URL}/${espnId}/overview`, {
        headers: { "User-Agent": "GolfPool/1.0" },
        next: { revalidate: 3600 },
      }),
      fetch(`${ESPN_PROFILE_URL}/${espnId}`, {
        headers: { "User-Agent": "GolfPool/1.0" },
        next: { revalidate: 86400 }, // bio rarely changes, cache 24hr
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
    let dob = "";
    let birthPlace = "--";
    let college = "--";
    let age = "--";

    if (profileRes.ok) {
      const profile = await profileRes.json();
      // ESPN profile: data is at top level — athlete object
      const athlete = profile.athlete || profile;

      dob = athlete.dateOfBirth || athlete.dob || "";
      const bp = athlete.birthPlace;
      if (bp) {
        birthPlace = [bp.city, bp.state, bp.country].filter(Boolean).join(", ") || "--";
      }
      college = athlete.college?.name || athlete.college?.shortName || "--";

      if (dob) {
        const birthDate = new Date(dob);
        const now = new Date();
        const years = now.getFullYear() - birthDate.getFullYear();
        const monthDiff = now.getMonth() - birthDate.getMonth();
        age = String(monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate()) ? years - 1 : years);
      }
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
