import { NextRequest, NextResponse } from "next/server";

const ESPN_ATHLETE_URL =
  "https://site.web.api.espn.com/apis/common/v3/sports/golf/pga/athletes";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ espnId: string }> }
) {
  const { espnId } = await params;

  try {
    const res = await fetch(`${ESPN_ATHLETE_URL}/${espnId}/overview`, {
      headers: { "User-Agent": "GolfPool/1.0" },
      next: { revalidate: 3600 }, // cache 1 hour
    });

    if (!res.ok) {
      return NextResponse.json(
        { wins: "--", top10s: "--", scoringAvg: "--", earnings: "--", birthDate: "", birthPlace: "--", college: "--", age: "--" },
        { headers: { "Cache-Control": "public, max-age=3600" } }
      );
    }

    const data = await res.json();

    // Extract season statistics
    // ESPN structure: statistics.labels = ["EVENTS","CUTS","TOP10","WINS","AVG","EARNINGS"]
    // statistics.splits.categories[0].stats = [{value, displayValue}, ...]
    let wins = "--";
    let top10s = "--";
    let scoringAvg = "--";
    let earnings = "--";

    const stats = data.statistics;
    if (stats) {
      const labels: string[] = stats.labels || [];

      // Try multiple possible stat locations
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
      const rawEarnings = labelMap.get("EARNINGS") || "";
      earnings = rawEarnings || "--";
    }

    // Extract bio data from athlete profile
    const athlete = data.athlete || {};
    const dob = athlete.dateOfBirth || "";
    const birthPlace = [athlete.birthPlace?.city, athlete.birthPlace?.state, athlete.birthPlace?.country]
      .filter(Boolean)
      .join(", ") || "--";
    const college = athlete.college?.name || "--";

    // Calculate age from DOB
    let age = "--";
    if (dob) {
      const birthDate = new Date(dob);
      const now = new Date();
      const years = now.getFullYear() - birthDate.getFullYear();
      const monthDiff = now.getMonth() - birthDate.getMonth();
      age = String(monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate()) ? years - 1 : years);
    }

    return NextResponse.json(
      { wins, top10s, scoringAvg, earnings, birthDate: dob, birthPlace, college, age },
      { headers: { "Cache-Control": "public, max-age=3600" } }
    );
  } catch (err) {
    console.error("Athlete stats error:", err);
    return NextResponse.json(
      { wins: "--", top10s: "--", scoringAvg: "--", earnings: "--", birthDate: "", birthPlace: "--", college: "--", age: "--" },
      { headers: { "Cache-Control": "public, max-age=600" } }
    );
  }
}
