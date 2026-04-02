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
        { wins: "--", top10s: "--", scoringAvg: "--", earnings: "--" },
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

    return NextResponse.json(
      { wins, top10s, scoringAvg, earnings },
      { headers: { "Cache-Control": "public, max-age=3600" } }
    );
  } catch (err) {
    console.error("Athlete stats error:", err);
    return NextResponse.json(
      { wins: "--", top10s: "--", scoringAvg: "--", earnings: "--" },
      { headers: { "Cache-Control": "public, max-age=600" } }
    );
  }
}
