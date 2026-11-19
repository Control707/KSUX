import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { pollOfficialAlerts } from "../../convex/officialAlerts";
import { SHADOW_MS, type PageFetch } from "../../convex/lib/officialAlerts";
import { createTestConvex, createVerifiedTestStudent } from "../helpers/convexTestEnv";

const fixtureDir = path.join(__dirname, "../fixtures/official-alerts");
const fixture = (name: string) => readFileSync(path.join(fixtureDir, name), "utf8");
const MIN = 60_000;
const START = Date.UTC(2026, 10, 19, 15, 0); // 10:00 Eastern

type Pages = { tw: string; adv: string } | "down";
function pagesFetch(pages: () => Pages): PageFetch {
  return async (url) => {
    const current = pages();
    if (current === "down") return { status: 503, ok: false, headers: { get: () => null }, text: async () => "" };
    const body = url.includes("public-safety-police") ? current.tw : current.adv;
    return { status: 200, ok: true, headers: { get: () => null }, text: async () => body };
  };
}

const QUIET = { tw: fixture("timely-warnings-quiet.html"), adv: fixture("emergency-advisory-quiet.html") };
const ISSUED = { tw: fixture("timely-warnings-issued.html"), adv: fixture("emergency-advisory-quiet.html") };

function env(mode: string, push: boolean) {
  process.env.KSUX_ALERT_COPY_MODE = mode;
  process.env.KSUX_ALERT_PUSH = push ? "true" : "false";
}

async function setup() {
  const t = createTestConvex();
  await t.mutation(internal.seed.bootstrapKsu, {});
  let pages: Pages = QUIET;
  const fetchImpl = pagesFetch(() => pages);
  const poll = (now: number) => t.action(async (ctx) => pollOfficialAlerts(ctx, now, fetchImpl));
  const sources = () => t.run(({ db }) => db.query("alertSources").withIndex("by_purge", (q) => q.eq("workspaceKey", "ksu")).collect());
  const items = () => t.run(({ db }) => db.query("alertItems").withIndex("by_purge", (q) => q.eq("workspaceKey", "ksu")).collect());
  /** Shadow for 14 clean days and sign off as a maintainer. */
  const passShadow = async () => {
    await t.run(async ({ db }) => {
      for (const s of await db.query("alertSources").withIndex("by_purge", (q) => q.eq("workspaceKey", "ksu")).collect()) {
        await db.patch(s._id, { shadowStartedAt: START - SHADOW_MS - MIN, shadowUnrecognizedCount: 0, shadowSignedOffAt: START - MIN });
      }
    });
  };
  return { t, poll, sources, items, passShadow, setPages: (p: Pages) => { pages = p; } };
}

async function optInDevice(t: ReturnType<typeof createTestConvex>, handle: string) {
  const student = await createVerifiedTestStudent(t, { handle, displayName: handle });
  const endpoint = `https://push.example/${handle}`;
  await t.mutation(api.push.registerPushSubscription, { sessionToken: student.sessionToken, endpoint, p256dh: "k", auth: "a" });
  await t.mutation(api.officialAlerts.setAlertPushPreference, { sessionToken: student.sessionToken, endpoint, optIn: true, confirmed: true });
  return { ...student, endpoint };
}

const scheduledPushes = (t: ReturnType<typeof createTestConvex>) => t.run(async ({ db }) =>
  (await db.system.query("_scheduled_functions").collect()).filter((f) => f.name.includes("fanOutAlertPushBatch")));

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(START); });
afterEach(() => {
  vi.useRealTimers();
  delete process.env.KSUX_ALERT_COPY_MODE;
  delete process.env.KSUX_ALERT_PUSH;
});

describe("source adapter results", () => {
  it("stays links-only while the copy is off, and polls nothing", async () => {
    env("off", false);
    const { t, sources } = await setup();
    await expect(t.action(internal.officialAlerts.runScheduledAlertPoll, {})).resolves.toEqual({ skipped: "links_only" });
    expect((await sources()).map((s) => s.adapterKind)).toEqual(["links_only", "links_only"]);
  });

  it("records the shadow poll in prod with the UI hidden", async () => {
    env("shadow", false);
    const { t, poll, sources } = await setup();
    await poll(START);
    const rows = await sources();
    expect(rows.map((s) => [s.adapterKind, s.lastResult, s.shadowStartedAt])).toEqual([
      ["html_copy", "quiet", START], ["html_copy", "quiet", START],
    ]);
    const student = await createVerifiedTestStudent(t, { handle: "shadow_view", displayName: "Shadow" });
    const status = await t.query(api.officialAlerts.alertSourceStatus, { sessionToken: student.sessionToken });
    expect(status.sources.every((s) => s.display === "links_only" && s.reason === "not_enabled")).toBe(true);
  });

  it("maps quiet, ok, unavailable and unrecognized to what a Student sees, with stale at read time", async () => {
    env("display", false);
    const { t, poll, setPages, passShadow } = await setup();
    await poll(START - MIN);
    await passShadow();
    const student = await createVerifiedTestStudent(t, { handle: "reader", displayName: "Reader" });
    const read = async () => (await t.query(api.officialAlerts.alertSourceStatus, { sessionToken: student.sessionToken })).sources;

    const quiet = await read();
    expect(quiet[0]).toMatchObject({ display: "quiet", quietText: "No Timely Warnings at This Time.", sourceName: "KSU Police" });

    setPages(ISSUED);
    await poll(START);
    const ok = await read();
    expect(ok[0]!.display).toBe("ok");
    expect(ok[0]!.items[0]).toMatchObject({ state: "issued", sourceName: "KSU Police", campus: "Kennesaw", firstObservedAt: START });

    // Unavailable keeps the last good copy until it is 20 minutes old, then it is stale; nothing is rewritten.
    setPages("down");
    await poll(START + 5 * MIN);
    expect((await read())[0]!.display).toBe("ok");
    vi.setSystemTime(START + 21 * MIN);
    const stale = await read();
    expect(stale[0]!.display).toBe("stale");
    expect(stale[0]!.items).toHaveLength(1);

    // A changed layout trips the automatic kill switch and falls back to links-only.
    setPages({ ...ISSUED, tw: fixture("timely-warnings-changed-layout.html") });
    await poll(START + 25 * MIN);
    const tripped = await read();
    expect(tripped[0]).toMatchObject({ display: "links_only", reason: "kill_switched", items: [] });
  });

  it("marks an item no longer listed, keeps it 24 h, then treats it as Older", async () => {
    env("display", false);
    const { t, poll, setPages, passShadow, items } = await setup();
    await passShadow();
    setPages(ISSUED);
    await poll(START);
    setPages(QUIET);
    await poll(START + 5 * MIN);
    expect((await items())[0]).toMatchObject({ state: "no_longer_listed", noLongerListedAt: START + 5 * MIN });
    const student = await createVerifiedTestStudent(t, { handle: "nll", displayName: "NLL" });
    const alertId = (await items())[0]!._id;
    const detail = await t.query(api.officialAlerts.getOfficialAlert, { sessionToken: student.sessionToken, alertId });
    expect(detail.found && detail.alert.lifecycle).toBe("current");
    vi.setSystemTime(START + 25 * 60 * MIN);
    await poll(START + 25 * 60 * MIN);
    const later = await t.query(api.officialAlerts.getOfficialAlert, { sessionToken: student.sessionToken, alertId });
    expect(later.found && later.alert.lifecycle).toBe("older");
  });

  it("writes nothing for an unchanged page between heartbeats", async () => {
    env("shadow", false);
    const { poll, sources } = await setup();
    await poll(START);
    const before = await sources();
    await poll(START + 5 * MIN);
    expect(await sources()).toEqual(before);
    await poll(START + 10 * MIN);
    expect((await sources())[0]!.lastSuccessAt).toBe(START + 10 * MIN);
  });
});

describe("opt-in Alert push", () => {
  it("is off by default and needs a confirmed opt-in on a registered device", async () => {
    env("display", true);
    const { t } = await setup();
    const student = await createVerifiedTestStudent(t, { handle: "optin", displayName: "Opt In" });
    const endpoint = "https://push.example/optin";
    await t.mutation(api.push.registerPushSubscription, { sessionToken: student.sessionToken, endpoint, p256dh: "k", auth: "a" });
    const pref = await t.query(api.officialAlerts.getAlertPushPreference, { sessionToken: student.sessionToken, endpoint });
    expect(pref).toMatchObject({ available: true, optedIn: false, thisDeviceRegistered: true });
    await expect(t.mutation(api.officialAlerts.setAlertPushPreference, { sessionToken: student.sessionToken, endpoint, optIn: true }))
      .rejects.toThrow(/Confirm/);
  });

  it("pushes only after two identical fetches, once per item", async () => {
    env("display", true);
    const { t, poll, setPages, passShadow, items } = await setup();
    await poll(START - 10 * MIN);
    await passShadow();
    await optInDevice(t, "pusher");
    setPages(ISSUED);
    await poll(START);
    expect(await scheduledPushes(t)).toHaveLength(0);
    await poll(START + 5 * MIN);
    expect(await scheduledPushes(t)).toHaveLength(1);
    expect((await items())[0]).toMatchObject({ pushDecision: "sent", confirmedFetches: 2 });
    await poll(START + 10 * MIN);
    expect(await scheduledPushes(t)).toHaveLength(1);
  });

  it("restarts the seen-twice count when the content changes or a fetch fails in between", async () => {
    env("display", true);
    const { t, poll, setPages, passShadow } = await setup();
    await passShadow();
    setPages(ISSUED);
    await poll(START);
    setPages("down");
    await poll(START + 5 * MIN);
    setPages(ISSUED);
    await poll(START + 10 * MIN);
    expect(await scheduledPushes(t)).toHaveLength(0);
    setPages({ ...ISSUED, tw: fixture("timely-warnings-updated.html") });
    await poll(START + 15 * MIN);
    expect(await scheduledPushes(t)).toHaveLength(0);
    await poll(START + 20 * MIN);
    expect(await scheduledPushes(t)).toHaveLength(1);
  });

  it("is blocked while stale, kill-switched, in shadow, or before sign-off", async () => {
    for (const [label, prepare] of [
      ["shadow mode", async (s: Awaited<ReturnType<typeof setup>>) => { env("shadow", true); await s.passShadow(); }],
      ["no sign-off", async () => { env("display", true); }],
      ["kill switch", async (s: Awaited<ReturnType<typeof setup>>) => {
        env("display", true); await s.passShadow();
        await s.t.run(async ({ db }) => { for (const r of await db.query("alertSources").collect()) await db.patch(r._id, { killSwitch: "manual" }); });
      }],
    ] as const) {
      const s = await setup();
      await prepare(s);
      s.setPages(ISSUED);
      await s.poll(START);
      await s.poll(START + 5 * MIN);
      expect(await scheduledPushes(s.t), label).toHaveLength(0);
    }
  });

  it("stops a fan-out once the source is stale or switched off", async () => {
    env("display", true);
    const { t, poll, setPages, passShadow, items } = await setup();
    await passShadow();
    setPages(ISSUED);
    await poll(START);
    await poll(START + 5 * MIN);
    const alertId = (await items())[0]!._id;
    const fanOut = () => t.action(internal.officialAlerts.fanOutAlertPushBatch, {
      alertId, sourceKey: "ksu_timely_warnings", allClear: false, cursor: null,
    });
    await expect(fanOut()).resolves.toEqual({ delivered: 0, more: false });
    vi.setSystemTime(START + 26 * MIN);
    await expect(fanOut()).resolves.toEqual({ stopped: true });
    vi.setSystemTime(START + 6 * MIN);
    await t.run(async ({ db }) => { for (const r of await db.query("alertSources").collect()) await db.patch(r._id, { killSwitch: "manual" }); });
    await expect(fanOut()).resolves.toEqual({ stopped: true });
  });

  it("caps Alert pushes at 3 per Eastern day across sources", async () => {
    env("display", true);
    const { t, poll, setPages, passShadow, items } = await setup();
    await passShadow();
    const page = (n: number) => fixture("timely-warnings-quiet.html").replace(
      /<p style="text-align: left;">[\s\S]*?<\/p>/,
      Array.from({ length: n }, (_, i) => `<h2>Timely Warning: Incident ${i + 1}</h2><p>Details ${i + 1}.</p>`).join(""));
    setPages({ tw: page(4), adv: QUIET.adv });
    await poll(START);
    await poll(START + 5 * MIN);
    const decisions = (await items()).map((i) => i.pushDecision).sort();
    expect(decisions).toEqual(["capped", "sent", "sent", "sent"]);
    expect(await scheduledPushes(t)).toHaveLength(3);
  });

  it("fans out in batches of 100 opted-in devices with a source-named payload", async () => {
    env("display", true);
    const { t } = await setup();
    await t.run(async ({ db }) => {
      const studentId = (await db.query("students").first())?._id
        ?? await db.insert("students", {
          workspaceKey: "prod", canonicalEmail: "fan@students.kennesaw.edu", emailDomainBadge: "verified_student",
          handle: "fan", handleLower: "fan", displayName: "Fan", searchText: "fan", homeCampus: "Kennesaw",
          activeCampusFilter: "Kennesaw", pinnedParkingLotIds: [], completedDealCount: 0, onboardingCompleted: true,
          accountStatus: "active", joinedAt: START,
        });
      for (let i = 0; i < 250; i++) {
        await db.insert("pushSubscriptions", {
          workspaceKey: "prod", studentId, endpoint: `https://push.example/${i}`, p256dh: "k", auth: "a",
          createdAt: START, lastUsedAt: START, officialAlertOptIn: i % 3 !== 0, officialAlertOptedInAt: START,
        });
      }
    });
    const first = await t.query(internal.officialAlerts.listOptedInBatchInternal, { cursor: null });
    expect(first.subscriptions).toHaveLength(100);
    const second = await t.query(internal.officialAlerts.listOptedInBatchInternal, { cursor: first.continueCursor });
    // 250 devices, every third not opted in: 166 opted in → one batch of 100, then 66.
    expect(first.continueCursor).not.toBeNull();
    expect(second.subscriptions).toHaveLength(66);
    expect(new Set([...first.subscriptions, ...second.subscriptions].map((s) => s.endpoint)).size).toBe(166);
    expect(second.continueCursor).toBeNull();
  });

  it("sends nothing from Judge Demo Mode", async () => {
    env("display", true);
    const { t } = await setup();
    const demo = await t.mutation(api.demo.session.provisionOrAttachDemoSession, {});
    const status = await t.query(api.officialAlerts.alertSourceStatus, { demoShortCode: demo.shortCode });
    expect(status.mode).toBe("demo");
    expect(status.sources.length).toBeGreaterThan(0);
    await expect(t.query(api.officialAlerts.getAlertPushPreference, { demoShortCode: demo.shortCode }))
      .resolves.toEqual({ available: false, reason: "demo" });
    await expect(t.mutation(api.officialAlerts.setAlertPushPreference, {
      demoShortCode: demo.shortCode, endpoint: "https://push.example/demo", optIn: true, confirmed: true,
    })).rejects.toThrow(/Demo Mode: no push/);
    const { pushBlockReason } = await import("../../convex/officialAlerts");
    const demoSource = await t.run(({ db }) => db.query("alertSources")
      .withIndex("by_purge", (q) => q.eq("workspaceKey", "demo:" + demo.demoSessionId)).first());
    expect(pushBlockReason(demoSource!, Date.now(), { mode: "display", push: true })).toBe("demo");
  });
});

describe("maintainer controls", () => {
  it("signs off after a shortened hackathon window and then displays and pushes", async () => {
    env("shadow", false);
    process.env.KSUX_ALERT_SHADOW_HOURS = "1";
    process.env.KSUX_MAINTAINER_EMAILS = "keeper@students.kennesaw.edu";
    try {
      const { t, poll, setPages } = await setup();
      await poll(START);
      const keeper = await createVerifiedTestStudent(t, { handle: "keeper", displayName: "Keeper" });
      await expect(t.mutation(api.officialAlerts.signOffAlertShadow, { sessionToken: keeper.sessionToken, sourceKey: "ksu_timely_warnings" }))
        .rejects.toThrow(/1 clean hours/);
      vi.setSystemTime(START + 61 * MIN);
      await poll(START + 61 * MIN);
      for (const sourceKey of ["ksu_timely_warnings", "ksu_emergency_advisories"]) {
        await t.mutation(api.officialAlerts.signOffAlertShadow, { sessionToken: keeper.sessionToken, sourceKey });
      }
      const ops = await t.query(api.officialAlerts.getAlertOps, { sessionToken: keeper.sessionToken });
      expect(ops?.sources.map((s) => [s.gatePassed, s.signedOffWindowMs])).toEqual([[true, 60 * MIN], [true, 60 * MIN]]);

      env("display", true);
      const status = await t.query(api.officialAlerts.alertSourceStatus, {});
      expect(status.sources.map((s) => s.display)).toEqual(["quiet", "quiet"]);
      await optInDevice(t, "hackathon_phone");
      setPages(ISSUED);
      await poll(START + 66 * MIN);
      await poll(START + 71 * MIN);
      expect(await scheduledPushes(t)).toHaveLength(1);

      // Restarting the shadow clears the shortened sign-off.
      await t.mutation(api.officialAlerts.restartAlertShadow, { sessionToken: keeper.sessionToken, sourceKey: "ksu_timely_warnings" });
      const after = await t.query(api.officialAlerts.getAlertOps, { sessionToken: keeper.sessionToken });
      expect(after?.sources[0]).toMatchObject({ gatePassed: false, signedOffWindowMs: null });
    } finally {
      delete process.env.KSUX_ALERT_SHADOW_HOURS;
      delete process.env.KSUX_MAINTAINER_EMAILS;
    }
  });

  it("lets only a maintainer switch a source off, and refuses an early shadow sign-off", async () => {
    env("shadow", false);
    const { t, poll, sources } = await setup();
    await poll(START);
    process.env.KSUX_MAINTAINER_EMAILS = "keeper@students.kennesaw.edu";
    try {
      const keeper = await createVerifiedTestStudent(t, { handle: "keeper", displayName: "Keeper" });
      const other = await createVerifiedTestStudent(t, { handle: "other", displayName: "Other" });
      await expect(t.mutation(api.officialAlerts.setAlertKillSwitch, { sessionToken: other.sessionToken, sourceKey: "ksu_timely_warnings", on: true }))
        .rejects.toThrow(/Maintainer/);
      await t.mutation(api.officialAlerts.setAlertKillSwitch, { sessionToken: keeper.sessionToken, sourceKey: "ksu_timely_warnings", on: true });
      expect((await sources()).find((s) => s.sourceKey === "ksu_timely_warnings")!.killSwitch).toBe("manual");
      await expect(t.mutation(api.officialAlerts.signOffAlertShadow, { sessionToken: keeper.sessionToken, sourceKey: "ksu_emergency_advisories" }))
        .rejects.toThrow(/14 clean days/);
      vi.setSystemTime(START + SHADOW_MS + MIN);
      await t.mutation(api.officialAlerts.signOffAlertShadow, { sessionToken: keeper.sessionToken, sourceKey: "ksu_emergency_advisories" });
      const ops = await t.query(api.officialAlerts.getAlertOps, { sessionToken: keeper.sessionToken });
      expect(ops?.sources.find((s) => s.sourceKey === "ksu_emergency_advisories")?.gatePassed).toBe(true);
      expect(await t.query(api.officialAlerts.getAlertOps, { sessionToken: other.sessionToken })).toBeNull();
    } finally {
      delete process.env.KSUX_MAINTAINER_EMAILS;
    }
  });
});
