import { TEST_SERVER_SECRET, requestTestOtp, verifyTestOtp, reserveTestUpload } from "../helpers/authTest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { sha256Hex } from "../../convex/lib/crypto";
import {
  createTestConvex,
  createVerifiedTestStudent,
} from "../helpers/convexTestEnv";

const MINUTE_MS = 60_000;

describe("Identity workflow regressions", () => {
  beforeEach(() => {
    vi.stubEnv("OWLSIDE_SERVER_SECRET", TEST_SERVER_SECRET);
    vi.stubEnv("OWLSIDE_SKIP_OTP_SCHEDULER", "true");
    vi.stubEnv("OWLSIDE_ALLOW_DEV_OTP_LOG", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("consumes an OTP once and stores only the hash of the resulting session token", async () => {
    const t = createTestConvex();
    const email = "one_time_login@students.kennesaw.edu";
    const now = Date.now();
    const otp = await requestTestOtp(t, {
      email,
      nowOverride: now,
    });
    expect(otp.devCodePreview).toMatch(/^\d{6}$/);
    const verification = {
      email,
      code: otp.devCodePreview!,
      nowOverride: now + 9 * MINUTE_MS,
    };
    const signedIn = await verifyTestOtp(t, verification);
    expect(signedIn.ok).toBe(true);
    if (!signedIn.ok) throw new Error("OTP verification failed");

    expect(signedIn.sessionToken).toMatch(/^[a-f0-9]{64}$/);
    expect(signedIn.needsOnboarding).toBe(true);
    expect(signedIn.student).not.toHaveProperty("canonicalEmail");
    expect(await verifyTestOtp(t, verification)).toMatchObject({
      ok: false,
      code: "OTP_EXPIRED_OR_LOCKED",
    });

    const sessionRows = await t.run((ctx) => ctx.db.query("studentSessions").collect());
    expect(sessionRows).toHaveLength(1);
    expect(sessionRows[0]?.tokenHash).toBe(await sha256Hex(signedIn.sessionToken));
  });

  it("rejects a correct OTP at the ten-minute expiry boundary without creating a session", async () => {
    const t = createTestConvex();
    const email = "expired_login@kennesaw.edu";
    const now = Date.now();
    const otp = await requestTestOtp(t, {
      email,
      nowOverride: now,
    });
    expect(otp.devCodePreview).toMatch(/^\d{6}$/);

    expect(await verifyTestOtp(t, {
      email,
      code: otp.devCodePreview!,
      nowOverride: now + 10 * MINUTE_MS,
    })).toMatchObject({ ok: false, code: "OTP_EXPIRED_OR_LOCKED" });
    expect(await t.run((ctx) => ctx.db.query("studentSessions").first())).toBeNull();
  });

  it("slides the session expiry on a mutation after a day and retains a fresh session on the next mutation", async () => {
    const t = createTestConvex();
    const { sessionToken } = await createVerifiedTestStudent(t, {
      handle: "sliding_session",
      displayName: "Session Tester",
    });
    const now = Date.now();
    const day = 24 * 60 * MINUTE_MS;
    const earlier = await t.run(async (ctx) => {
      const session = await ctx.db.query("studentSessions").first();
      if (!session) throw new Error("Session fixture is missing");
      await ctx.db.patch(session._id, {
        lastRefreshedAt: now - 2 * day,
        expiresAt: now + 2 * day,
      });
      return session._id;
    });

    await t.mutation(api.students.updateProfile, { sessionToken, major: "Design" });
    const renewed = await t.run((ctx) => ctx.db.get(earlier));
    if (!renewed) throw new Error("Renewed session is missing");
    expect(renewed.lastRefreshedAt).toBeGreaterThanOrEqual(now);
    expect(renewed.expiresAt - renewed.lastRefreshedAt).toBe(30 * day);

    await t.mutation(api.students.updateProfile, { sessionToken, major: "Chemistry" });
    expect(await t.run((ctx) => ctx.db.get(earlier))).toEqual(renewed);
  });

  it("treats repeat registration of the same upload as one Demo workspace upload", async () => {
    const t = createTestConvex();
    const demo = await t.mutation(api.demo.session.provisionOrAttachDemoSession, {});
    const auth = { demoShortCode: demo.shortCode, demoPersonaHandle: "maya_cs" };
    const upload = {
      ...auth,
      fileKey: "demo-upload-retry",
      url: "https://media.example/demo-upload-retry.webp",
      purpose: "post" as const,
      byteSize: 1234,
      width: 64,
      height: 64,
    };

    const registration = await reserveTestUpload(t, upload);
    const firstId = await t.mutation(api.uploads.registerMediaAsset, registration);
    const retriedId = await t.mutation(api.uploads.registerMediaAsset, registration);
    expect(retriedId).toBe(firstId);
    expect(await t.query(api.demo.session.getDemoWorkspaceInfo, auth)).toMatchObject({
      uploadCount: 1,
    });
  });
});
