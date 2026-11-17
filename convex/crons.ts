import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// :42 Hourly cursor-batched demo workspace, pending media, & expired session/pulse purge
crons.hourly(
  "hourly-workspace-and-pulse-purge",
  { minuteUTC: 42 },
  internal.housekeeping.runHourlyPurge,
  {}
);

// 30m Localist + Anthology Engage Events deduplicated diff-gated sync (:07, :37)
crons.cron(
  "sync-ksu-events-30m",
  "7,37 * * * *",
  internal.sync.eventsSync.runScheduledEventsSync,
  {}
);

// 2m Passio GO Big Owl Bus Shuttle Routes diff-gated sync (auto-throttles to 30m overnight)
crons.interval(
  "sync-passio-shuttle-2m",
  { minutes: 2 },
  internal.sync.transitDiningSync.runScheduledShuttleSync,
  {}
);

// The action gates each feed by its Eastern wall-clock schedule across DST.
crons.cron(
  "sync-nutrislice-dining",
  "0,15 9,10,15,16 * * *",
  internal.sync.transitDiningSync.runScheduledDiningSync,
  {}
);

// 30m Daytime sequential LibCal Study Rooms warm cron (:12, :42)
crons.cron(
  "warm-libcal-study-rooms-30m",
  "12,42 * * * *",
  internal.sync.libcalSync.runSequentialLibCalRefresh,
  { fromWarmCron: true }
);

export default crons;
