import { NextRequest, NextResponse } from "next/server";

const ESPN_BASE =
  "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard";

const BOVADA_GOLF_URL =
  "https://www.bovada.lv/services/sports/event/v2/events/A/description/golf";

const OWGR_URL =
  "https://apiweb.owgr.com/api/owgr/rankings/getRankings?pageSize=300&pageNumber=1";

const PGA_TOUR_GRAPHQL = "https://orchestrator.pgatour.com/graphql";
const PGA_TOUR_API_KEY = "da2-gsrx5bibzbb4njvhl7t37wqyl4";

const ESPN_SEARCH = "https://site.web.api.espn.com/apis/common/v3/search";

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

    const league = data.leagues?.[0];
    let events: { id: string; endDate?: string }[] = [];

    if (league?.calendar) {
      const cal = league.calendar;
      if (Array.isArray(cal)) {
        for (const entry of cal) {
          if (entry.entries) events.push(...entry.entries);
          else if (entry.events) events.push(...entry.events);
          else if (entry.id) events.push(entry);
        }
      }
    }

    if (data.events) {
      for (const ev of data.events) {
        if (ev.id && !events.some((e) => e.id === ev.id)) {
          events.push(ev);
        }
      }
    }

    if (events.length > 0) {
      const idx = events.findIndex((e) => String(e.id) === String(currentEventId));
      if (idx > 0) return String(events[idx - 1].id);
    }

    return null;
  } catch {
    return null;
  }
}

// Fetch Official World Golf Rankings
async function fetchWorldRankings(): Promise<Map<string, number>> {
  const rankMap = new Map<string, number>();
  try {
    const res = await fetch(OWGR_URL, {
      headers: { "User-Agent": "GolfPool/1.0", Accept: "application/json" },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return rankMap;
    const data = await res.json();
    for (const entry of data.rankingsList || []) {
      const name = normalizeForMatch(
        entry.player?.fullName || `${entry.player?.firstName} ${entry.player?.lastName}`
      );
      rankMap.set(name, entry.rank);
    }
  } catch (err) {
    console.error("OWGR fetch error:", err);
  }
  return rankMap;
}

// Fetch tournament odds from Bovada, matched to a specific tournament name
async function fetchOdds(tournamentName: string): Promise<Map<string, string>> {
  const oddsMap = new Map<string, string>();
  try {
    const res = await fetch(BOVADA_GOLF_URL, {
      headers: { "User-Agent": "GolfPool/1.0" },
      next: { revalidate: 1800 },
    });
    if (!res.ok) return oddsMap;
    const data = await res.json();
    const normTournament = normalizeForMatch(tournamentName);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allEvents: any[] = [];
    for (const group of data || []) {
      for (const ev of group.events || []) {
        allEvents.push(ev);
      }
    }

    // Match by: exact name → either name contains the other → shared key words → first event with a Winner market
    const matchedEvent =
      allEvents.find((ev) => normalizeForMatch(ev.description) === normTournament) ||
      allEvents.find((ev) => {
        const normEv = normalizeForMatch(ev.description);
        return normEv.includes(normTournament) || normTournament.includes(normEv);
      }) ||
      allEvents.find((ev) => {
        const normEv = normalizeForMatch(ev.description);
        // Strip common suffixes like year, "2026", "boosted specials"
        const keyWords = normTournament.split(" ").filter((w: string) => w.length > 3 && !/^\d{4}$/.test(w));
        const evKeyWords = normEv.split(" ").filter((w: string) => w.length > 3 && !/^\d{4}$/.test(w));
        // Check if key words overlap in either direction
        return (keyWords.length > 0 && keyWords.some((w: string) => normEv.includes(w))) ||
               (evKeyWords.length > 0 && evKeyWords.some((w: string) => normTournament.includes(w)));
      }) ||
      // Last resort: first event that has a Winner market (skip prop bets like "3-Balls")
      allEvents.find((ev) =>
        ev.displayGroups?.some((dg: { markets?: { description?: string }[] }) =>
          dg.markets?.some((m: { description?: string }) => {
            const d = (m.description || "").toLowerCase();
            return d === "winner" || d === "outright winner";
          })
        )
      ) ||
      allEvents[0];

    if (!matchedEvent) return oddsMap;

    for (const group of matchedEvent.displayGroups || []) {
      for (const market of group.markets || []) {
        const desc = (market.description || "").toLowerCase();
        if (desc === "winner" || desc === "outright winner" || desc === "winner live") {
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
  } catch (err) {
    console.error("Odds fetch error:", err);
  }
  return oddsMap;
}

// ── PGA Tour fallback ──────────────────────────────────────────────

// Find PGA Tour tournament ID by matching tournament name from ESPN calendar
async function findPgaTourId(tournamentName: string): Promise<string | null> {
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
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const sched = data?.data?.schedule;
    if (!sched) return null;

    const allTournaments: { tournamentName: string; id: string }[] = [];
    for (const group of [...(sched.completed || []), ...(sched.upcoming || [])]) {
      for (const t of group.tournaments || []) {
        allTournaments.push(t);
      }
    }

    const normName = normalizeForMatch(tournamentName);
    // Exact match
    const exact = allTournaments.find((t) => normalizeForMatch(t.tournamentName) === normName);
    if (exact) return exact.id;
    // Partial match — key words
    const words = normName.split(" ").filter((w) => w.length > 3);
    if (words.length > 0) {
      const partial = allTournaments.find((t) => {
        const normT = normalizeForMatch(t.tournamentName);
        return words.every((w) => normT.includes(w));
      });
      if (partial) return partial.id;
    }
    return null;
  } catch (err) {
    console.error("PGA Tour schedule error:", err);
    return null;
  }
}

// Fetch field from PGA Tour API
async function fetchPgaTourField(
  pgaTourId: string
): Promise<{ firstName: string; lastName: string }[]> {
  try {
    const res = await fetch(PGA_TOUR_GRAPHQL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": PGA_TOUR_API_KEY,
      },
      body: JSON.stringify({
        query: `{ field(id:"${pgaTourId}") { tournamentName players { firstName lastName } } }`,
      }),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data?.data?.field?.players || [];
  } catch (err) {
    console.error("PGA Tour field error:", err);
    return [];
  }
}

// Look up ESPN ID for a player by name (for headshots)
async function lookupEspnId(playerName: string): Promise<number> {
  try {
    const res = await fetch(
      `${ESPN_SEARCH}?query=${encodeURIComponent(playerName)}&type=player&sport=golf&limit=1`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return 0;
    const data = await res.json();
    const items = data?.items || [];
    if (items.length > 0 && items[0].id) {
      return parseInt(items[0].id, 10);
    }
  } catch {
    // ignore
  }
  return 0;
}

// Batch lookup ESPN IDs for multiple players (with concurrency limit)
async function batchLookupEspnIds(
  names: string[]
): Promise<Map<string, number>> {
  const idMap = new Map<string, number>();
  // Process in batches of 10 to avoid hammering the API
  const BATCH_SIZE = 10;
  for (let i = 0; i < names.length; i += BATCH_SIZE) {
    const batch = names.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (name) => {
        const id = await lookupEspnId(name);
        return { name, id };
      })
    );
    for (const { name, id } of results) {
      idMap.set(name, id);
    }
  }
  return idMap;
}

// ── Main handler ───────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;

  try {
    // 1. Fetch ESPN scoreboard + world rankings in parallel
    const [eventRes, worldRankMap] = await Promise.all([
      fetch(`${ESPN_BASE}?event=${eventId}`, { next: { revalidate: 600 } }),
      fetchWorldRankings(),
    ]);
    if (!eventRes.ok) throw new Error(`ESPN API error: ${eventRes.status}`);
    const eventData = await eventRes.json();

    const event = eventData.events?.[0];
    if (!event?.competitions?.[0]) {
      return NextResponse.json({ players: [], eventName: "" });
    }

    // Verify ESPN returned the correct event
    const returnedEventId = String(event.id || "");
    const isCorrectEvent = returnedEventId === String(eventId);

    // Get tournament name from calendar for future events
    const calendar = eventData.leagues?.[0]?.calendar ?? [];
    const calEntry = calendar.find(
      (e: { id: string; label: string }) => String(e.id) === String(eventId)
    );
    const tournamentName = isCorrectEvent
      ? event.name || event.shortName || ""
      : calEntry?.label || "";

    // ── ESPN has the field ─────────────────────────────────────────
    if (isCorrectEvent) {
      const competitors: ESPNCompetitor[] =
        event.competitions[0].competitors || [];

      const oddsMap = await fetchOdds(tournamentName);

      // Try to get previous event results
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

      const players = competitors.map((c, i) => {
        const name = c.athlete?.fullName || c.athlete?.displayName || "Unknown";
        const norm = normalizeForMatch(name);
        const odds = oddsMap.get(norm) || "";
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
          worldRank: worldRankMap.get(norm) || 0,
          lastFinish: lastFinishMap.get(norm) || "--",
          odds,
          oddsNum,
          status: c.status?.type?.name || "active",
        };
      });

      const hasOdds = players.some((p) => p.oddsNum < 999999);
      if (hasOdds) {
        players.sort((a, b) => a.oddsNum - b.oddsNum);
      } else {
        players.sort((a, b) => a.rank - b.rank);
      }

      return NextResponse.json({
        players,
        eventName: tournamentName,
        prevEventName,
        eventId,
      });
    }

    // ── ESPN doesn't have the field — try PGA Tour API ─────────────
    if (!tournamentName) {
      return NextResponse.json({
        players: [],
        eventName: "",
        fieldNotAvailable: true,
        eventId,
      });
    }

    const pgaTourId = await findPgaTourId(tournamentName);
    if (!pgaTourId) {
      return NextResponse.json({
        players: [],
        eventName: tournamentName,
        fieldNotAvailable: true,
        eventId,
      });
    }

    // Fetch PGA Tour field + odds in parallel
    const [pgaPlayers, oddsMap] = await Promise.all([
      fetchPgaTourField(pgaTourId),
      fetchOdds(tournamentName),
    ]);

    if (pgaPlayers.length === 0) {
      return NextResponse.json({
        players: [],
        eventName: tournamentName,
        fieldNotAvailable: true,
        eventId,
      });
    }

    // Build player names and look up ESPN IDs for headshots
    const playerNames = pgaPlayers.map(
      (p) => `${p.firstName} ${p.lastName}`
    );
    const espnIdMap = await batchLookupEspnIds(playerNames);

    const players = playerNames.map((name, i) => {
      const norm = normalizeForMatch(name);
      const odds = oddsMap.get(norm) || "";
      let oddsNum = 999999;
      if (odds) {
        const parsed = parseInt(odds.replace("+", ""), 10);
        if (!isNaN(parsed)) oddsNum = parsed;
      }
      return {
        espnId: espnIdMap.get(name) || 0,
        name,
        country: "",
        rank: i + 1,
        worldRank: worldRankMap.get(norm) || 0,
        lastFinish: "--",
        odds,
        oddsNum,
        status: "active",
      };
    });

    // Sort by odds (favorites first), then world rank, then alphabetical
    const hasOdds = players.some((p) => p.oddsNum < 999999);
    if (hasOdds) {
      players.sort((a, b) => a.oddsNum - b.oddsNum);
    } else {
      players.sort((a, b) => (a.worldRank || 999) - (b.worldRank || 999));
    }

    return NextResponse.json({
      players,
      eventName: tournamentName,
      prevEventName: "",
      eventId,
      source: "pgatour",
    });
  } catch (err) {
    console.error("Field API error:", err);
    return NextResponse.json({ players: [], eventName: "" }, { status: 500 });
  }
}
