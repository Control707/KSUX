import { afterEach, describe, expect, it, vi } from "vitest";
import { internal } from "../../convex/_generated/api";
import { createTestConvex, createVerifiedTestStudent } from "../helpers/convexTestEnv";

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 17, 17);

afterEach(() => vi.unstubAllEnvs());

describe("Hourly housekeeping workflows", () => {
  it("collects only abandoned pending uploads outside expired demo workspaces", async () => {
    const t = createTestConvex();
    const { studentId } = await createVerifiedTestStudent(t, {
      handle: "media_owner",
      displayName: "Media Owner",
    });
    await t.run(async ({ db }) => {
      const assets = [
        { fileKey: "old-pending", status: "pending", createdAt: NOW - 2 * HOUR - 1 },
        { fileKey: "at-cutoff", status: "pending", createdAt: NOW - 2 * HOUR },
        { fileKey: "old-attached", status: "attached", createdAt: NOW - 3 * HOUR },
      ] as const;
      for (const asset of assets) {
        await db.insert("mediaAssets", {
          workspaceKey: "prod",
          ownerStudentId: studentId,
          url: `https://utfs.io/f/${asset.fileKey}`,
          purpose: "post",
          byteSize: 1024,
          width: 128,
          height: 128,
          ...asset,
        });
      }
    });

    const collected = await t.mutation(internal.housekeeping.collectPurgeableMediaKeys, { now: NOW });
    expect(collected.fileKeys).toEqual(["old-pending"]);
    await t.mutation(internal.housekeeping.executePurgeBatch, {
      now: NOW,
      deletedFileKeys: collected.fileKeys,
    });
    const remaining = await t.run(({ db }) => db.query("mediaAssets").collect());
    expect(remaining.map((asset) => asset.fileKey).sort()).toEqual(["at-cutoff", "old-attached"]);
  });

  it("preserves pending remote media records when storage deletion is skipped", async () => {
    vi.stubEnv("UPLOADTHING_TOKEN", "");
    const t = createTestConvex();
    const { studentId } = await createVerifiedTestStudent(t, {
      handle: "pending_owner",
      displayName: "Pending Media Owner",
    });
    const mediaId = await t.run(({ db }) =>
      db.insert("mediaAssets", {
        workspaceKey: "prod",
        ownerStudentId: studentId,
        fileKey: "remote-pending",
        url: "https://utfs.io/f/remote-pending",
        purpose: "post",
        byteSize: 1024,
        width: 128,
        height: 128,
        status: "pending",
        createdAt: NOW - 3 * HOUR,
      })
    );

    await t.action(internal.housekeeping.runHourlyPurge, { now: NOW });

    expect(await t.run(({ db }) => db.get(mediaId))).toMatchObject({ status: "pending" });
  });

  it("continues the hourly purge when more than five expired demo workspaces are queued", async () => {
    const t = createTestConvex();
    const activeId = await t.run(async ({ db }) => {
      for (let index = 0; index < 6; index++) {
        await db.insert("demoSessions", {
          shortCode: `expired-${index}`,
          defaultPersonaHandle: "maya_cs",
          uploadCount: 0,
          createdAt: NOW - HOUR,
          lastActiveAt: NOW - HOUR,
          expiresAt: NOW - 1,
        });
      }
      return db.insert("demoSessions", {
        shortCode: "active",
        defaultPersonaHandle: "maya_cs",
        uploadCount: 0,
        createdAt: NOW - HOUR,
        lastActiveAt: NOW - HOUR,
        expiresAt: NOW + HOUR,
      });
    });

    await t.action(internal.housekeeping.runHourlyPurge, { now: NOW });

    const remaining = await t.run(({ db }) => db.query("demoSessions").collect());
    expect(remaining.map((demo) => demo._id)).toEqual([activeId]);
  });

  it("acknowledges more than one batch of local files without dropping later keys", async () => {
    const t = createTestConvex();
    const { studentId } = await createVerifiedTestStudent(t, {
      handle: "local_media_owner",
      displayName: "Local Media Owner",
    });
    await t.run(async ({ db }) => {
      for (let index = 0; index < 205; index++) {
        await db.insert("mediaAssets", {
          workspaceKey: "prod",
          ownerStudentId: studentId,
          fileKey: `local-inline:${index}`,
          url: "",
          purpose: "post",
          byteSize: 200,
          width: 16,
          height: 16,
          status: "deleted",
          createdAt: NOW - HOUR,
        });
      }
    });
    const result = await t.action(internal.housekeeping.runHourlyPurge, { now: NOW });
    expect(result.rounds).toBe(2);
    expect(result.totalProcessed).toBe(205);
    expect(await t.run(({ db }) => db.query("mediaAssets").first())).toBeNull();
  });

  it("deletes every demo Event before discarding its expired demo workspace", async () => {
    const t = createTestConvex();
    const workspaceKey = await t.run(async ({ db }) => {
      const demoId = await db.insert("demoSessions", {
        shortCode: "expired-events",
        defaultPersonaHandle: "maya_cs",
        uploadCount: 0,
        createdAt: NOW - HOUR,
        lastActiveAt: NOW - HOUR,
        expiresAt: NOW - 1,
      });
      const workspace = `demo:${demoId}`;
      for (let index = 0; index < 26; index++) {
        await db.insert("events", {
          workspaceKey: workspace,
          source: "student",
          campus: "Kennesaw",
          campusScope: "Kennesaw",
          isVirtual: false,
          title: `Demo Event ${index}`,
          description: "",
          searchText: `Demo Event ${index}`,
          locationName: "Student Center",
          startTime: NOW + index * HOUR,
          endTime: NOW + (index + 1) * HOUR,
          status: "scheduled",
          visibilityStatus: "visible",
          prodGoingCount: 0,
          prodInterestedCount: 0,
        });
      }
      return workspace;
    });

    await t.action(internal.housekeeping.runHourlyPurge, { now: NOW });

    const remaining = await t.run(({ db }) =>
      db.query("events").withIndex("by_all_start", (q) => q.eq("workspaceKey", workspaceKey)).collect()
    );
    expect(remaining).toEqual([]);
  });
});
