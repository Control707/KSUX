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

export default crons;
