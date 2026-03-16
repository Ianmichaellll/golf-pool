import { NextRequest, NextResponse } from "next/server";

// ESPN event scoreboard — returns competitors for a specific event
function espnEventUrl(eventId: string) {
  return `https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?event=${eventId}`;
}

type ESPNCompetitor = {
  id: string;
  athlete: {
    fullName: string;
    displayName: string;
    shortName: string;
    flag?: { alt?: string };
    headshot?: { href?: string };
  };
  status?: { type?: { name?: string } };
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;

  try {
    const res = await fetch(espnEventUrl(eventId), {
      next: { revalidate: 600 }, // cache 10 min
    });
    if (!res.ok) throw new Error(`ESPN API error: ${res.status}`);
    const data = await res.json();

    const event = data.events?.[0];
    if (!event) {
      return NextResponse.json({ players: [], eventName: "" });
    }

    const competition = event.competitions?.[0];
    const competitors: ESPNCompetitor[] = competition?.competitors ?? [];

    const players = competitors.map((c, i) => ({
      espnId: parseInt(c.id, 10),
      name: c.athlete?.fullName || c.athlete?.displayName || "Unknown",
      country: c.athlete?.flag?.alt || "",
      rank: i + 1,
      status: c.status?.type?.name || "active",
    }));

    return NextResponse.json({
      players,
      eventName: event.name || event.shortName || "",
      eventId,
    });
  } catch (err) {
    console.error("Field API error:", err);
    return NextResponse.json({ players: [], eventName: "" }, { status: 500 });
  }
}
