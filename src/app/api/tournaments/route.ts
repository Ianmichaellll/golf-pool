import { NextResponse } from "next/server";

// ESPN PGA Tour scoreboard — returns calendar + current event
const ESPN_SCOREBOARD =
  "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard";

export async function GET() {
  try {
    const res = await fetch(ESPN_SCOREBOARD, { next: { revalidate: 3600 } });
    if (!res.ok) throw new Error(`ESPN API error: ${res.status}`);
    const data = await res.json();

    // Extract calendar events
    const calendar = data.leagues?.[0]?.calendar ?? [];
    const tournaments = calendar.map(
      (e: { id: string; label: string; startDate: string; endDate: string }) => ({
        id: e.id,
        name: e.label,
        startDate: e.startDate,
        endDate: e.endDate,
      })
    );

    return NextResponse.json({ tournaments });
  } catch (err) {
    console.error("Tournaments API error:", err);
    return NextResponse.json({ tournaments: [] }, { status: 500 });
  }
}
