import { expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { incidentPostingIsReady, projectMonthlyV2Io, v2IoShapes } from "../../convex/lib/v2Launch";
import { createTestConvex, createVerifiedTestStudent } from "../helpers/convexTestEnv";

it("projects measured bytes by query shape and distinguishes the launch thresholds", () => {
  const now = Date.UTC(2026, 10, 18);
  const measure = (bytes: number) => projectMonthlyV2Io(JSON.stringify({
    days: 3, measuredAt: new Date(now).toISOString(),
    bytes: Object.fromEntries(v2IoShapes.map(({ key }) => [key, key === "leaderboard" ? bytes : 0])),
  }), now);
  expect(measure(49_999_999)).toMatchObject({ projectedBytes: 499_999_990, band: "under_50" });
  expect(measure(50_000_000)).toMatchObject({ projectedBytes: 500_000_000, band: "over_50" });
  expect(measure(70_000_000)).toMatchObject({ projectedBytes: 700_000_000, band: "over_70" });
  expect(projectMonthlyV2Io('{"days":3}')).toBeNull();
});

it("requires both switches and two eligible appointments", () => {
  expect(incidentPostingIsReady(true, true, 2)).toBe(true);
  expect(incidentPostingIsReady(true, true, 1)).toBe(false);
  expect(incidentPostingIsReady(true, false, 2)).toBe(false);
  expect(incidentPostingIsReady(false, true, 2)).toBe(false);
});

it("opens production posting without eligible appointments and keeps the meter private", async () => {
  const t = createTestConvex();
  const maintainer = await createVerifiedTestStudent(t, { handle: "launch_lead", displayName: "Launch Lead" });
  const student = await createVerifiedTestStudent(t, { handle: "launch_reader", displayName: "Launch Reader" });
  vi.stubEnv("KSUX_MAINTAINER_EMAILS", maintainer.canonicalEmail);
  vi.stubEnv("KSUX_V2_MODERATOR_OPS_COMPLETE", "true");
  vi.stubEnv("KSUX_V2_INCIDENT_POSTING", "true");
  try {
    await expect(t.query(api.moderation.getV2LaunchOps, { sessionToken: student.sessionToken })).resolves.toBeNull();
    await expect(t.query(api.moderation.getV2LaunchOps, { sessionToken: maintainer.sessionToken })).resolves.toMatchObject({
      gate: { postingEnabled: true, moderatorCount: 0, opsChecklistDone: true, requested: true },
    });
    await expect(t.query(api.moderation.getIncidentLaunchStatus, { sessionToken: student.sessionToken }))
      .resolves.toEqual({ postingEnabled: true });
    const bytes = Object.fromEntries(v2IoShapes.map(({ key }) => [key, key === "leaderboard" ? 70_000_000 : 0]));
    vi.stubEnv("KSUX_V2_DB_IO_SAMPLE", JSON.stringify({ days: 3, measuredAt: new Date().toISOString(), bytes }));
    await expect(t.query(api.moderation.getV2LaunchOps, { sessionToken: maintainer.sessionToken })).resolves.toMatchObject({
      io: { projectedBytes: 700_000_000, band: "over_70", stale: false, shapes: expect.arrayContaining([
        expect.objectContaining({ key: "leaderboard", projectedBytes: 700_000_000 }),
      ]) },
    });
    vi.stubEnv("KSUX_V2_DB_IO_SAMPLE", JSON.stringify({
      days: 3, measuredAt: new Date(Date.now() - 8 * 24 * 60 * 60_000).toISOString(), bytes,
    }));
    await expect(t.query(api.moderation.getV2LaunchOps, { sessionToken: maintainer.sessionToken })).resolves.toMatchObject({ io: { stale: true } });
    vi.stubEnv("KSUX_V2_DB_IO_SAMPLE", "invalid JSON");
    await expect(t.query(api.moderation.getV2LaunchOps, { sessionToken: maintainer.sessionToken })).resolves.toMatchObject({ io: null });
    await expect(t.query(api.moderation.getV2LaunchOps, {})).rejects.toThrow();
    const demo = await t.mutation(api.demo.session.provisionOrAttachDemoSession, {});
    await expect(t.query(api.moderation.getV2LaunchOps, {
      demoShortCode: demo.shortCode, demoPersonaHandle: "maya_cs",
    })).resolves.toBeNull();
    await expect(t.query(api.moderation.getIncidentLaunchStatus, {
      demoShortCode: demo.shortCode, demoPersonaHandle: "maya_cs",
    })).resolves.toEqual({ postingEnabled: true });
  } finally {
    vi.unstubAllEnvs();
  }
});
