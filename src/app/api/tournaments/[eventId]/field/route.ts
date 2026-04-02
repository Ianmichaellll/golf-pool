import { NextRequest, NextResponse } from "next/server";

const ESPN_BASE =
  "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard";

const BOVADA_GOLF_URL =
  "https://www.bovada.lv/services/sports/event/v2/events/A/description/golf";

type ESPNCompetitor = {
  id: string;
  order?: number;
  score?: string;
  athlete: {
    fullName: string;
    displayName: string;
    shortName: string;
    flag?: { alt?: string };
  };
  status?: {
    type?: { name?: string; description?: string };
  };
};

type CalendarEntry = {
  id?: string;
  label?: string;
  startDate?: string;
  endDate?: string;
  // ESPN calendar can be flat strings or objects — handle both
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

function getFinishPosition(c: ESPNCompetitor): string {
  const desc = c.status?.type?.description?.toLowerCase() || "";
  if (desc.includes("cut") || c.score === "CUT" || c.score === "MC") return "MC";
  if (desc === "wd" || desc === "withdrawn" || c.score === "WD") return "WD";
  if (c.order) return String(c.order);
  return "--";
}

// Try to find the previous event ID from the ESPN calendar
async function findPreviousEventId(
  currentEventId: string
): Promise<string | null> {
  try {
    const res = await fetch(ESPN_BASE, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const data = await res.json();

    // ESPN calendar can be nested — try multiple structures
    const league = data.leagues?.[0];
    let events: { id: string; endDate?: string }[] = [];

    // Try calendar array
    if (league?.calendar) {
      const cal = league.calendar;
      // Calendar might be array of objects with nested events
      if (Array.isArray(cal)) {
        for (const entry of cal) {
          if (entry.entries) {
            events.push(...entry.entries);
          } else if (entry.events) {
            events.push(...entry.events);
          } else if (entry.id) {
            events.push(entry);
          }
        }
      }
    }

    // Also check data.events for recently completed events
    if (data.events) {
      for (const ev of data.events) {
        if (ev.id && !events.some((e) => e.id === ev.id)) {
          events.push(ev);
        }
      }
    }

    // If we got events, find the one before current
    if (events.length > 0) {
      const idx = events.findIndex((e) => String(e.id) === String(currentEventId));
      if (idx > 0) return String(events[idx - 1].id);
    }

    // Fallback: try fetching season schedule
    const seasonRes = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?dates=2026",
      { next: { revalidate: 3600 } }
    );
    if (seasonRes.ok) {
      const seasonData = await seasonRes.json();
      const seasonEvents: { id: string }[] = seasonData.events || [];
      const idx = seasonEvents.findIndex(
        (e) => String(e.id) === String(currentEventId)
      );
      if (idx > 0) return String(seasonEvents[idx - 1].id);
    }

    return null;
  } catch {
    return null;
  }
}

// Fetch tournament odds from Bovada (free, no auth, all PGA events)
async function fetchOdds(): Promise<Map<string, string>> {
  const oddsMap = new Map<string, string>();

  try {
    const res = await fetch(BOVADA_GOLF_URL, {
      headers: { "User-Agent": "GolfPool/1.0" },
      next: { revalidate: 1800 }, // cache 30 min
    });
    if (!res.ok) return oddsMap;

    const data = await res.json();

    // Bovada structure: array of event groups → events[] → displayGroups[] → markets[] → outcomes[]
    // Find the "Winner" market in the first PGA event
    const events = data?.[0]?.events || [];
    for (const event of events) {
      const groups = event.displayGroups || [];
      for (const group of groups) {
        const markets = group.markets || [];
        for (const market of markets) {
          if (
            market.description?.toLowerCase() === "winner" ||
            market.description?.toLowerCase() === "outright winner"
          ) {
            for (const outcome of market.outcomes || []) {
              const name = normalizeForMatch(outcome.description || "");
              const american = outcome.price?.american || "";
              if (name && american) {
                oddsMap.set(name, american);
              }
            }
            if (oddsMap.size > 0) return oddsMap;
          }
        }
      }
    }
  } catch (err) {
    console.error("Odds fetch error:", err);
  }

  return oddsMap;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;

  try {
    // 1. Fetch current event field + odds in parallel
    const [eventRes, oddsMap] = await Promise.all([
      fetch(`${ESPN_BASE}?event=${eventId}`, { next: { revalidate: 600 } }),
      fetchOdds(),
    ]);
    if (!eventRes.ok) throw new Error(`ESPN API error: ${eventRes.status}`);
    const eventData = await eventRes.json();

    const event = eventData.events?.[0];
    if (!event?.competitions?.[0]) {
      return NextResponse.json({ players: [], eventName: "" });
    }

    const competitors: ESPNCompetitor[] =
      event.competitions[0].competitors || [];

    // 2. Try to get previous event results for "last finish"
    const lastFinishMap = new Map<string, string>();
    let prevEventName = "";

    const prevEventId = await findPreviousEventId(eventId);
    if (prevEventId) {
      try {
        const prevRes = await fetch(`${ESPN_BASE}?event=${prevEventId}`, {
          next: { revalidate: 3600 },
        });
        if (prevRes.ok) {
          const prevData = await prevRes.json();
          const prevEvent = prevData.events?.[0];
          prevEventName = prevEvent?.shortName || prevEvent?.name || "";
          const prevCompetitors: ESPNCompetitor[] =
            prevEvent?.competitions?.[0]?.competitors || [];

          for (const c of prevCompetitors) {
            const norm = normalizeForMatch(
              c.athlete?.fullName || c.athlete?.displayName || ""
            );
            lastFinishMap.set(norm, getFinishPosition(c));
          }
        }
      } catch (err) {
        console.error("Failed to load previous event:", err);
      }
    }

    // 3. Build player list — sorted by ESPN order (dynamic per-event ranking)
    const players = competitors.map((c, i) => {
      const name = c.athlete?.fullName || c.athlete?.displayName || "Unknown";
      const norm = normalizeForMatch(name);

      const odds = oddsMap.get(norm) || "";
      // Parse odds to numeric for sorting (lower = favorite)
      let oddsNum = 999999;
      if (odds) {
        const parsed = parseInt(odds.replace("+", ""), 10);
        if (!isNaN(parsed)) oddsNum = parsed;
      }

      return {
        espnId: parseInt(c.id, 10),
        name,
        country: c.athlete?.flag?.alt || "",
        rank: c.order ?? i + 1,
        lastFinish: lastFinishMap.get(norm) || "--",
        odds,
        oddsNum,
        status: c.status?.type?.name || "active",
      };
    });

    // Sort by odds when available (favorites first), fall back to ESPN order
    const hasOdds = players.some((p) => p.oddsNum < 999999);
    if (hasOdds) {
      players.sort((a, b) => a.oddsNum - b.oddsNum);
    } else {
      players.sort((a, b) => a.rank - b.rank);
    }

    return NextResponse.json({
      players,
      eventName: event.name || event.shortName || "",
      prevEventName,
      eventId,
    });
  } catch (err) {
    console.error("Field API error:", err);
    return NextResponse.json({ players: [], eventName: "" }, { status: 500 });
  }
}
