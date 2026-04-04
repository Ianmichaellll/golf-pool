import { NextResponse } from "next/server";

// ESPN PGA Tour scoreboard — returns calendar + current event
const ESPN_SCOREBOARD =
  "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard";

export async function GET() {
  try {
    const res = await fetch(ESPN_SCOREBOARD, { next: { revalidate: 3600 } });
    if (!res.ok) throw new Error(`ESPN API error: ${res.status}`);
    const data = await res.json();

    // The current/active event returned by ESPN — this is the latest event with a field
    const activeEventId = data.events?.[0]?.id
      ? String(data.events[0].id)
      : null;

    // Extract calendar events
    const calendar = data.leagues?.[0]?.calendar ?? [];
    const tournaments = calendar.map(
      (e: { id: string; label: string; startDate: string; endDate: string }) => {
        const eid = String(e.id);
        const endDate = new Date(e.endDate);
        const now = new Date();
        // Field is available if: event is the active one, or it ended in the past
        const fieldAvailable =
          eid === activeEventId || endDate < now;
        return {
          id: eid,
          name: e.label,
          startDate: e.startDate,
          endDate: e.endDate,
          fieldAvailable,
        };
      }
    );

    return NextResponse.json({ tournaments });
  } catch (err) {
    console.error("Tournaments API error:", err);
    return NextResponse.json({ tournaments: [] }, { status: 500 });
  }
}
