import { NextResponse } from "next/server";

const ESPN_SCOREBOARD =
  "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard";

const PGA_TOUR_GRAPHQL = "https://orchestrator.pgatour.com/graphql";
const PGA_TOUR_API_KEY = "da2-gsrx5bibzbb4njvhl7t37wqyl4";

function normalizeForMatch(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.\-']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Fetch PGA Tour schedule to find which tournaments have fields available
async function fetchPgaTourFieldIds(): Promise<Set<string>> {
  const names = new Set<string>();
  try {
    const year = new Date().getFullYear();
    const res = await fetch(PGA_TOUR_GRAPHQL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": PGA_TOUR_API_KEY,
      },
      body: JSON.stringify({
        query: `{ schedule(tourCode:"R", year:"${year}") { completed { tournaments { tournamentName id } } upcoming { tournaments { tournamentName id } } } }`,
      }),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return names;
    const data = await res.json();
    const sched = data?.data?.schedule;
    if (!sched) return names;

    // For each upcoming tournament, check if it has a field by trying to fetch it
    // To avoid making too many requests, we just return all tournament names
    // and the field route will verify availability when actually requested
    for (const group of [...(sched.completed || []), ...(sched.upcoming || [])]) {
      for (const t of group.tournaments || []) {
        names.add(normalizeForMatch(t.tournamentName));
      }
    }
  } catch (err) {
    console.error("PGA Tour schedule error:", err);
  }
  return names;
}

export async function GET() {
  try {
    const [espnRes, pgaTourNames] = await Promise.all([
      fetch(ESPN_SCOREBOARD, { next: { revalidate: 3600 } }),
      fetchPgaTourFieldIds(),
    ]);
    if (!espnRes.ok) throw new Error(`ESPN API error: ${espnRes.status}`);
    const data = await espnRes.json();

    const activeEventId = data.events?.[0]?.id
      ? String(data.events[0].id)
      : null;

    const calendar = data.leagues?.[0]?.calendar ?? [];
    const tournaments = calendar.map(
      (e: { id: string; label: string; startDate: string; endDate: string }) => {
        const eid = String(e.id);
        const endDate = new Date(e.endDate);
        const now = new Date();
        // ESPN has the field if event is active or past
        const espnHasField = eid === activeEventId || endDate < now;
        // PGA Tour has the field if tournament name matches
        const pgaTourHasField = pgaTourNames.has(normalizeForMatch(e.label));
        return {
          id: eid,
          name: e.label,
          startDate: e.startDate,
          endDate: e.endDate,
          fieldAvailable: espnHasField || pgaTourHasField,
        };
      }
    );

    return NextResponse.json({ tournaments });
  } catch (err) {
    console.error("Tournaments API error:", err);
    return NextResponse.json({ tournaments: [] }, { status: 500 });
  }
}
