import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import { convexModules, createVerifiedTestStudent } from "../helpers/convexTestEnv";

// Mirror #97's roster contract without introducing its production schema in #96.
vi.mock("../../convex/schema", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../convex/schema")>();
  const { defineSchema, defineTable } = await import("convex/server");
  const { v } = await import("convex/values");
  return { ...original, default: defineSchema({ ...original.default.tables, moderators: defineTable({
    workspaceKey: v.literal("prod"), studentId: v.id("students"), appointedById: v.id("students"),
    csaStatement: v.string(), isCsa: v.boolean(), appointedAt: v.number(),
    revokedAt: v.optional(v.number()), purgeAt: v.optional(v.number()),
  }).index("by_student", ["workspaceKey", "studentId"])
    .index("by_revoked", ["workspaceKey", "revokedAt"])
    .index("by_purge", ["workspaceKey", "purgeAt"]) }) };
});

const rosterSchema = defineSchema({ ...schema.tables, moderators: defineTable({
  workspaceKey: v.literal("prod"), studentId: v.id("students"), appointedById: v.id("students"),
  csaStatement: v.string(), isCsa: v.boolean(), appointedAt: v.number(),
  revokedAt: v.optional(v.number()), purgeAt: v.optional(v.number()),
}).index("by_student", ["workspaceKey", "studentId"])
    .index("by_revoked", ["workspaceKey", "revokedAt"])
    .index("by_purge", ["workspaceKey", "purgeAt"]) });

async function setup() {
  const t = convexTest({ schema: rosterSchema, modules: convexModules });
  const lead = await createVerifiedTestStudent(t, { handle: "lead", displayName: "Lead" });
  const reader = await createVerifiedTestStudent(t, { handle: "reader", displayName: "Reader" });
  vi.stubEnv("KSUX_MAINTAINER_EMAILS", lead.canonicalEmail);
  vi.stubEnv("KSUX_V2_MODERATOR_OPS_COMPLETE", "true");
  vi.stubEnv("KSUX_V2_INCIDENT_POSTING", "true");
  const appoint = (studentId: typeof lead.studentId, overrides = {}) => t.run((ctx) => ctx.db.insert("moderators", {
    workspaceKey: "prod", studentId, appointedById: lead.studentId, isCsa: false,
    csaStatement: "I am not a campus security authority.", appointedAt: Date.now() - 1000, ...overrides,
  }));
  const status = () => t.query(api.moderation.getIncidentLaunchStatus, { sessionToken: reader.sessionToken });
  const ops = () => t.query(api.moderation.getV2LaunchOps, { sessionToken: lead.sessionToken });
  return { t, lead, reader, appoint, status, ops };
}

afterEach(() => vi.unstubAllEnvs());

it("enables only with two distinct eligible appointments and closes on revocation or a disabled switch", async () => {
  const { t, reader, appoint, status, ops } = await setup();
  await expect(status()).resolves.toEqual({ postingEnabled: false });
  const appointee = await createVerifiedTestStudent(t, { handle: "appointee", displayName: "Appointee" });
  await appoint(appointee.studentId);
  await appoint(appointee.studentId);
  await expect(ops()).resolves.toMatchObject({ gate: { moderatorCount: 1, postingEnabled: false } });
  const appointment = await appoint(reader.studentId);
  await expect(status()).resolves.toEqual({ postingEnabled: true });
  vi.stubEnv("KSUX_V2_MODERATOR_OPS_COMPLETE", "false");
  await expect(status()).resolves.toEqual({ postingEnabled: false });
  vi.stubEnv("KSUX_V2_MODERATOR_OPS_COMPLETE", "true");
  vi.stubEnv("KSUX_V2_INCIDENT_POSTING", "false");
  await expect(status()).resolves.toEqual({ postingEnabled: false });
  vi.stubEnv("KSUX_V2_INCIDENT_POSTING", "true");
  await t.run((ctx) => ctx.db.patch(appointment, { revokedAt: Date.now() }));
  await expect(status()).resolves.toEqual({ postingEnabled: false });
});

it("does not count Faculty · Staff, unverified, suspended, CSA, expired or future appointees", async () => {
  const { t, lead, reader, appoint, ops } = await setup();
  await appoint(lead.studentId);
  const exclusions = [
    { emailDomainBadge: "faculty_staff" as const, canonicalEmail: "faculty@kennesaw.edu" },
    { canonicalEmail: undefined },
    { accountStatus: "suspended" as const },
  ];
  for (let i = 0; i < exclusions.length; i++) {
    const student = await createVerifiedTestStudent(t, { handle: `excluded_${i}`, displayName: "Excluded" });
    await t.run((ctx) => ctx.db.patch(student.studentId, exclusions[i]));
    await appoint(student.studentId);
  }
  await appoint(reader.studentId, { isCsa: true });
  await appoint(reader.studentId, { csaStatement: "  " });
  await appoint(reader.studentId, { purgeAt: Date.now() - 1 });
  await appoint(reader.studentId, { appointedAt: Date.now() + 60_000 });
  await expect(ops()).resolves.toMatchObject({ gate: { moderatorCount: 1, postingEnabled: false } });
});

it("does not truncate the eligible count after the first hundred ineligible rows", async () => {
  const { lead, reader, appoint, ops } = await setup();
  for (let i = 0; i < 100; i++) await appoint(reader.studentId, { isCsa: true });
  await appoint(lead.studentId);
  await appoint(reader.studentId);
  await expect(ops()).resolves.toMatchObject({ gate: { moderatorCount: 2, postingEnabled: true } });
});
