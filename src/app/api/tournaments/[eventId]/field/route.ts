import { NextRequest, NextResponse } from "next/server";
import { MASTERS_2026_FIELD, oddsToNumber } from "../../../../lib/golfers";

// ESPN event scoreboard — returns competitors for a specific event
function espnEventUrl(eventId: string) {
  return `https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?event=${eventId}`;
}

type ESPNCompetitor = {
  id: string;
  order?: number;
  athlete: {
    fullName: string;
    displayName: string;
    shortName: string;
    flag?: { alt?: string };
    headshot?: { href?: string };
  };
  status?: { type?: { name?: string } };
};

function normalizeForMatch(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.\-']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

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

    // Build lookup from golfers.ts (name-normalized → golfer data)
    const golferLookup = new Map(
      MASTERS_2026_FIELD.map((g) => [normalizeForMatch(g.name), g])
    );

    const players = competitors.map((c, i) => {
      const name = c.athlete?.fullName || c.athlete?.displayName || "Unknown";
      const norm = normalizeForMatch(name);
      const golfer = golferLookup.get(norm);

      return {
        espnId: parseInt(c.id, 10),
        name,
        country: c.athlete?.flag?.alt || golfer?.country || "",
        rank: golfer?.rank || (c.order ?? i + 1),
        odds: golfer?.odds || "",
        oddsNum: golfer ? oddsToNumber(golfer.odds) : 999999,
        worldRank: golfer?.rank || 0,
        status: c.status?.type?.name || "active",
      };
    });

    // Sort by odds (favorites first), then by ESPN order for unmatched
    players.sort((a, b) => a.oddsNum - b.oddsNum);

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
