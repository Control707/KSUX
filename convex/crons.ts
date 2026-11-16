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

export default crons;
