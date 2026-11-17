import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestConvex, createVerifiedTestStudent } from "../helpers/convexTestEnv";

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 17, 17);

async function createViewer() {
  const t = createTestConvex();
  const { sessionToken } = await createVerifiedTestStudent(t, {
    handle: "commuter",
    displayName: "Campus Commuter",
  });
  return { t, sessionToken };
}

async function addRoute(
  t: ReturnType<typeof createTestConvex>,
  passioRouteId: string,
  campusScope: "Kennesaw" | "Marietta" | "Both"
) {
  await t.run(({ db }) =>
    db.insert("shuttleRoutes", {
      passioRouteId,
      campusScope,
      shortName: passioRouteId,
      name: `${campusScope} Shuttle Route`,
      colorHex: "#FDBB30",
      geoFeatureId: `route-${passioRouteId}`,
      stops: [],
      operatingHoursSummary: "Weekdays",
    })
  );
}

afterEach(() => vi.useRealTimers());

describe("Now HUD and Campus Pulse workflows", () => {
  it("applies a one-off Campus override without changing the Student's saved Campus", async () => {
    const { t, sessionToken } = await createViewer();
    await addRoute(t, "k-local", "Kennesaw");
    await addRoute(t, "m-local", "Marietta");
    await addRoute(t, "74760", "Both");

    const override = await t.query(api.shell.getNowHud, { sessionToken, campusOverride: "Marietta" });
    const saved = await t.query(api.shell.getNowHud, { sessionToken });
    expect(override.campusFilter).toBe("Marietta");
    expect(override.shuttleCards.map((route) => route.passioRouteId)).toEqual(["m-local", "74760"]);
    expect(saved.campusFilter).toBe("Kennesaw");
    expect(saved.shuttleCards.map((route) => route.passioRouteId)).toEqual(["k-local", "74760"]);
  });

  it("keeps the intercampus Shuttle Route when local routes fill the card limits", async () => {
    const { t, sessionToken } = await createViewer();
    for (let index = 1; index <= 5; index++) {
      await addRoute(t, `local-${index}`, "Kennesaw");
    }
    await addRoute(t, "74760", "Both");

    const hud = await t.query(api.shell.getNowHud, { sessionToken });
    const shell = await t.query(api.shell.shellSummary, { sessionToken });
    expect({
      now: hud.shuttleCards.map((route) => route.passioRouteId),
      campusPulse: shell.campusPulse.shuttleRoutes.map((route) => route.passioRouteId),
    }).toEqual({
      now: expect.arrayContaining(["74760"]),
      campusPulse: expect.arrayContaining(["74760"]),
    });
  });

  it("represents missing Shuttle Route ETAs as unavailable across the shell", async () => {
    const { t, sessionToken } = await createViewer();
    await addRoute(t, "74760", "Both");

    const hud = await t.query(api.shell.getNowHud, { sessionToken });
    const shell = await t.query(api.shell.shellSummary, { sessionToken });
    expect({
      now: hud.shuttleCards[0]?.etaMinutes,
      campusPulse: shell.campusPulse.shuttleRoutes[0]?.nextEtaMinutes,
    }).toEqual({ now: null, campusPulse: null });
  });

  it("keeps recently finished Events out of upcoming Now cards", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const { t, sessionToken } = await createViewer();
    await t.run(async ({ db }) => {
      for (const event of [
        { title: "Finished Event", startTime: NOW - HOUR, endTime: NOW - 1 },
        { title: "Ongoing Event", startTime: NOW - HOUR, endTime: NOW + HOUR },
        { title: "Upcoming Event", startTime: NOW + HOUR, endTime: NOW + 2 * HOUR },
      ]) {
        await db.insert("events", {
          workspaceKey: "ksu",
          source: "localist",
          campus: "Kennesaw",
          campusScope: "Kennesaw",
          isVirtual: false,
          description: "",
          searchText: event.title,
          locationName: "Student Center",
          status: "scheduled",
          visibilityStatus: "visible",
          prodGoingCount: 0,
          prodInterestedCount: 0,
          ...event,
        });
      }
    });

    const hud = await t.query(api.shell.getNowHud, { sessionToken });
    expect(hud.eventCards.map((event) => event.title)).toEqual(["Ongoing Event", "Upcoming Event"]);
  });
});
