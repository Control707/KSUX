import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { createTestConvex, createVerifiedTestStudent } from "../helpers/convexTestEnv";

afterEach(() => vi.useRealTimers());

it("shares Your stop between Transit and Now, privately per Student and Demo persona", async () => {
  const t = createTestConvex();
  await t.mutation(internal.seed.bootstrapKsu, {});
  const owner = await createVerifiedTestStudent(t, { handle: "traveller", displayName: "Traveller" });
  const other = await createVerifiedTestStudent(t, { handle: "other", displayName: "Other Student" });
  await t.mutation(api.transitDining.setYourStop, { sessionToken: owner.sessionToken, stopId: "361" });
  const lot = await t.run(({ db }) => db.query("parkingLots").first());
  await t.mutation(api.parking.saveParkingPreferences, { sessionToken: owner.sessionToken, togglePinLotId: lot!._id });
  expect(await t.query(api.transitDining.listShuttleOverview, { sessionToken: owner.sessionToken })).toMatchObject({ yourStopId: "361" });
  expect(await t.query(api.shell.getNowHud, { sessionToken: owner.sessionToken })).toMatchObject({
    wayfinding: { yourStopId: "361", pinnedLots: [{ slug: lot!.slug, latitude: lot!.latitude, longitude: lot!.longitude }] },
  });
  expect(await t.query(api.shell.getNowHud, { sessionToken: other.sessionToken })).toMatchObject({ wayfinding: { yourStopId: null, pinnedLots: [] } });
  await expect(t.mutation(api.transitDining.setYourStop, { sessionToken: owner.sessionToken, stopId: "invented" })).rejects.toThrow("published Shuttle Stop");
  const demo = await t.mutation(api.demo.session.provisionOrAttachDemoSession, {});
  await t.mutation(api.transitDining.setYourStop, { demoShortCode: demo.shortCode, demoPersonaHandle: "maya_cs", stopId: "362" });
  expect(await t.query(api.shell.getNowHud, { demoShortCode: demo.shortCode, demoPersonaHandle: "alex_owl" })).toMatchObject({ wayfinding: { yourStopId: null } });
  expect(await t.query(api.shell.getNowHud, { sessionToken: owner.sessionToken })).toMatchObject({ wayfinding: { yourStopId: "361" } });
  await t.mutation(api.transitDining.setYourStop, { sessionToken: owner.sessionToken, stopId: null });
  expect(await t.query(api.shell.getNowHud, { sessionToken: owner.sessionToken })).toMatchObject({ wayfinding: { yourStopId: null } });
});

it("uses only the requested boarding stop's arrivals and labels stale, missing and Demo data", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const now = Date.parse("2026-11-19T15:00:00Z");
  vi.setSystemTime(now);
  const t = createTestConvex();
  await t.mutation(internal.seed.bootstrapKsu, {});
  const { sessionToken } = await createVerifiedTestStudent(t, { handle: "arrivals", displayName: "Arrivals" });
  const snapshotId = await t.run(({ db }) => db.insert("shuttleSnapshots", {
    singletonKey: "latest", fetchedAt: now, etasFetchedAt: now, vehicles: [], shuttleNotices: [],
    stopEtas: [
      { passioRouteId: "74760", stopId: "362", etaMinutes: 1, arrivalAt: now + 60_000, loadLabel: "" },
      { passioRouteId: "74760", stopId: "361", etaMinutes: 5, arrivalAt: now + 300_000, loadLabel: "" },
    ],
  }));
  const args = { sessionToken, routeId: "74760", stopId: "361" };
  expect(await t.query(api.transitDining.classArrival, args)).toMatchObject({ state: "live", arrivalAt: now + 300_000, fixture: false });
  vi.setSystemTime(now + 37_000);
  expect(await t.query(api.transitDining.classArrival, args)).toMatchObject({ state: "stale", arrivalAt: null });
  await t.run(({ db }) => db.patch(snapshotId, { etasFetchedAt: now + 37_000, stopEtas: [] }));
  expect(await t.query(api.transitDining.classArrival, args)).toMatchObject({ state: "missing", arrivalAt: null });
  await t.run(({ db }) => db.patch(snapshotId, { isFixture: true, stopEtas: [{ passioRouteId: "74760", stopId: "361", etaMinutes: 3, loadLabel: "Demo" }] }));
  expect(await t.query(api.transitDining.classArrival, args)).toMatchObject({ state: "missing", arrivalAt: null, fixture: false });
  const demo = await t.mutation(api.demo.session.provisionOrAttachDemoSession, {});
  expect(await t.query(api.transitDining.classArrival, { routeId: "74760", stopId: "361", demoShortCode: demo.shortCode, demoPersonaHandle: "maya_cs" })).toMatchObject({ state: "live", fixture: true });
});
