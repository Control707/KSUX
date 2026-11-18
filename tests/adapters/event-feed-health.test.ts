import { expect, it } from "vitest";
import { runEventsIngestCycle } from "../../convex/sync/eventsSync";

it("accepts verified empty event calendars and rejects malformed replacements", async () => {
  const run = (engageCalendar: string) => runEventsIngestCycle({
    nowMs: Date.UTC(2026, 10, 18),
    syncState: { activeRecordCount: 0, consecutiveFailures: 0 },
    fetchImpl: async (url) => url.includes("calendar.kennesaw.edu")
      ? new Response(JSON.stringify({ page: { current: 1, total: 0 }, events: [] }))
      : url.endsWith(".ics") ? new Response(engageCalendar) : new Response("Unavailable", { status: 503 }),
  });
  expect(await run("BEGIN:VCALENDAR\r\nEND:VCALENDAR")).toMatchObject({
    status: "ready_to_upsert",
    events: [],
    sourceObservations: [
      { sourceKey: "localist_events", outcome: "accepted", count: 0 },
      { sourceKey: "engage_events", outcome: "accepted", count: 0 },
    ],
  });
  expect(await run("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nEND:VEVENT\r\nEND:VCALENDAR")).toMatchObject({
    status: "failed_or_aborted",
    sourceObservations: [
      { sourceKey: "localist_events", outcome: "accepted", count: 0 },
      { sourceKey: "engage_events", outcome: "failed" },
    ],
  });
});
