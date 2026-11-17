import { describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { sha256Hex } from "../../convex/lib/crypto";
import { createTestConvex, createVerifiedTestStudent } from "../helpers/convexTestEnv";

const device = "https://push.example/current-device";
const otherDevice = "https://push.example/other-device";

function register(t: ReturnType<typeof createTestConvex>, sessionToken: string, endpoint: string) {
  return t.mutation(api.push.registerPushSubscription, { sessionToken, endpoint, p256dh: "test-key", auth: "test-auth" });
}

describe("Web Push sign-out", () => {
  it("revokes delivery for the current device and preserves other devices and sessions", async () => {
    const t = createTestConvex();
    const student = await createVerifiedTestStudent(t, { handle: "push_logout", displayName: "Push Logout" });
    const otherToken = "test-other-browser-session";
    const tokenHash = await sha256Hex(otherToken);
    const now = Date.now();
    await t.run((ctx) => ctx.db.insert("studentSessions", {
      studentId: student.studentId, tokenHash, createdAt: now, lastRefreshedAt: now, expiresAt: now + 60_000,
    }));
    await register(t, student.sessionToken, device);
    await register(t, otherToken, otherDevice);

    await expect(t.mutation(api.auth.signOutSession, {
      sessionToken: student.sessionToken, pushEndpoint: device,
    })).resolves.toEqual({ ok: true, pushRemoved: true });

    await expect(t.query(api.push.getMyPushSubscriptions, { sessionToken: student.sessionToken }))
      .rejects.toThrow(/session expired or invalid/i);
    await expect(t.query(api.push.getMyPushSubscriptions, { sessionToken: otherToken }))
      .resolves.toEqual({ supportedInMode: true, endpoints: [otherDevice] });
    const deliveries = await t.query(internal.push.listStudentSubscriptionsInternal, { studentId: student.studentId });
    expect(deliveries.map(({ endpoint }) => endpoint)).toEqual([otherDevice]);
  });

  it("does not delete a push endpoint owned by another Student", async () => {
    const t = createTestConvex();
    const student = await createVerifiedTestStudent(t, { handle: "first_student", displayName: "First Student" });
    const peer = await createVerifiedTestStudent(t, { handle: "second_student", displayName: "Second Student" });
    await register(t, peer.sessionToken, device);

    await expect(t.mutation(api.auth.signOutSession, {
      sessionToken: student.sessionToken, pushEndpoint: device,
    })).resolves.toEqual({ ok: true, pushRemoved: false });

    const deliveries = await t.query(internal.push.listStudentSubscriptionsInternal, { studentId: peer.studentId });
    expect(deliveries.map(({ endpoint }) => endpoint)).toEqual([device]);
  });
});
