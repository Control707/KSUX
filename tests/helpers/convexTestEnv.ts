import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { sha256Hex } from "../../convex/lib/crypto";
import { Id } from "../../convex/_generated/dataModel";

export const convexModules = (
  import.meta as unknown as {
    glob: (pattern: string) => Record<string, () => Promise<any>>;
  }
).glob("../../convex/**/*.*s");

export function createTestConvex() {
  return convexTest({
    schema,
    modules: convexModules,
  });
}

export async function createVerifiedTestStudent(
  t: ReturnType<typeof createTestConvex>,
  opts: {
    email?: string;
    handle: string;
    displayName: string;
    homeCampus?: "Kennesaw" | "Marietta";
    emailDomainBadge?: "verified_student" | "faculty_staff";
    major?: string;
    classYear?: string;
  }
): Promise<{
  studentId: Id<"students">;
  sessionToken: string;
  canonicalEmail: string;
}> {
  const canonicalEmail = (
    opts.email ?? `${opts.handle}@students.kennesaw.edu`
  ).toLowerCase();
  const sessionToken = `tok_${opts.handle}_${Math.random().toString(36).slice(2)}`;
  const tokenHash = await sha256Hex(sessionToken);
  const now = Date.now();

  const studentId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("students", {
      workspaceKey: "prod",
      canonicalEmail,
      emailDomainBadge: opts.emailDomainBadge ?? "verified_student",
      handle: opts.handle.toLowerCase(),
      handleLower: opts.handle.toLowerCase(),
      displayName: opts.displayName,
      searchText: `@${opts.handle.toLowerCase()} ${opts.displayName} ${opts.major ?? ""}`,
      homeCampus: opts.homeCampus ?? "Kennesaw",
      activeCampusFilter: opts.homeCampus ?? "Kennesaw",
      major: opts.major,
      classYear: opts.classYear,
      pinnedParkingLotIds: [],
      completedDealCount: 0,
      onboardingCompleted: true,
      accountStatus: "active",
      joinedAt: now,
    });

    await ctx.db.insert("studentSessions", {
      tokenHash,
      studentId: id,
      createdAt: now,
      lastRefreshedAt: now,
      expiresAt: now + 30 * 24 * 60 * 60 * 1000,
    });

    return id;
  });

  return { studentId, sessionToken, canonicalEmail };
}
