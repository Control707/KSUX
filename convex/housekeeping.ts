import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const BATCH_LIMIT = 200;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const collectPurgeableMediaKeys = internalMutation({
  args: {
    now: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const expiredDemos = await ctx.db
      .query("demoSessions")
      .withIndex("by_expires", (q) => q.lt("expiresAt", now))
      .take(25);

    const fileKeys: string[] = [];
    const assetIds: string[] = [];

    for (const demo of expiredDemos) {
      const assets = await ctx.db
        .query("mediaAssets")
        .withIndex("by_demo_session", (q) => q.eq("demoSessionId", demo._id))
        .take(BATCH_LIMIT);
      for (const a of assets) {
        if (a.status !== "deleted") {
          fileKeys.push(a.fileKey);
          assetIds.push(String(a._id));
        }
      }
    }

    // Abandoned pending composer uploads older than 2 hours
    const abandoned = await ctx.db
      .query("mediaAssets")
      .withIndex("by_status_created", (q) =>
        q.eq("status", "pending").lt("createdAt", now - TWO_HOURS_MS)
      )
      .take(BATCH_LIMIT);

    for (const a of abandoned) {
      fileKeys.push(a.fileKey);
      assetIds.push(String(a._id));
    }

    return {
      fileKeys: Array.from(new Set(fileKeys)),
      assetIds: Array.from(new Set(assetIds)),
      expiredDemoIds: expiredDemos.map((d) => d._id),
    };
  },
});

export const executePurgeBatch = internalMutation({
  args: {
    now: v.optional(v.number()),
    deletedFileKeys: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    let deletedCount = 0;

    // 1. Delete cleaned mediaAsset records
    for (const fk of args.deletedFileKeys.slice(0, BATCH_LIMIT)) {
      const asset = await ctx.db
        .query("mediaAssets")
        .withIndex("by_file_key", (q) => q.eq("fileKey", fk))
        .unique();
      if (asset) {
        await ctx.db.delete(asset._id);
        deletedCount++;
      }
    }

    // 2. Cascade-delete expired demoSessionId rows in <= 200-doc cursor batches
    const expiredDemos = await ctx.db
      .query("demoSessions")
      .withIndex("by_expires", (q) => q.lt("expiresAt", now))
      .take(5);

    let hasMoreDemoRows = false;
    const demoChildTables = [
      "scrappyMessages",
      "scrappyThreads",
      "chatMessages",
      "chatMembers",
      "chats",
      "savedInteractions",
      "hashtagDailyCounts",
      "parkingReports",
      "campusPulses",
      "studySessions",
      "studentEnrollments",
      "eventRsvps",
      "clubMembers",
      "moderationReports",
      "studentBlocks",
      "studentFollows",
      "interpersonalLedgers",
      "handleReservations",
      "mediaAssets",
      "listings",
      "posts",
      "students",
    ] as const;

    for (const demo of expiredDemos) {
      if (deletedCount >= BATCH_LIMIT) {
        hasMoreDemoRows = true;
        break;
      }
      const wsKey = `demo:${demo._id}`;
      let remainingForDemo = false;

      for (const table of demoChildTables) {
        const budget = BATCH_LIMIT - deletedCount;
        if (budget <= 0) {
          remainingForDemo = true;
          hasMoreDemoRows = true;
          break;
        }
        const rows = await (ctx.db.query(table as any) as any)
          .filter((q: any) => q.eq(q.field("workspaceKey"), wsKey))
          .take(budget);
        for (const r of rows) {
          await ctx.db.delete(r._id);
          deletedCount++;
        }
        if (rows.length === budget) {
          remainingForDemo = true;
          hasMoreDemoRows = true;
          break;
        }
      }

      if (!remainingForDemo && deletedCount < BATCH_LIMIT) {
        const demoClubs = await ctx.db
          .query("clubs")
          .withIndex("by_workspace_slug", (q) => q.eq("workspaceKey", wsKey))
          .take(25);
        for (const c of demoClubs) {
          await ctx.db.delete(c._id);
          deletedCount++;
        }
        const demoEvents = await ctx.db
          .query("events")
          .withIndex("by_all_start", (q) => q.eq("workspaceKey", wsKey))
          .take(25);
        for (const e of demoEvents) {
          await ctx.db.delete(e._id);
          deletedCount++;
        }
        await ctx.db.delete(demo._id);
        deletedCount++;
      }
    }

    // 3. Prune expired OTPs (>1h past expiry), studentSessions, rateLimitBuckets, interpersonalLedgers, handleReservations, aged pulses (>24h), and >30d Listings
    if (deletedCount < BATCH_LIMIT) {
      const oldOtps = await ctx.db
        .query("emailOtps")
        .withIndex("by_expires", (q) => q.lt("expiresAt", now - ONE_HOUR_MS))
        .take(Math.max(1, BATCH_LIMIT - deletedCount));
      for (const r of oldOtps) {
        await ctx.db.delete(r._id);
        deletedCount++;
      }
    }

    if (deletedCount < BATCH_LIMIT) {
      const oldSessions = await ctx.db
        .query("studentSessions")
        .withIndex("by_expires", (q) => q.lt("expiresAt", now))
        .take(Math.max(1, BATCH_LIMIT - deletedCount));
      for (const r of oldSessions) {
        await ctx.db.delete(r._id);
        deletedCount++;
      }
    }

    if (deletedCount < BATCH_LIMIT) {
      const oldBuckets = await ctx.db
        .query("rateLimitBuckets")
        .withIndex("by_expires", (q) => q.lt("expiresAt", now))
        .take(Math.max(1, BATCH_LIMIT - deletedCount));
      for (const r of oldBuckets) {
        await ctx.db.delete(r._id);
        deletedCount++;
      }
    }

    if (deletedCount < BATCH_LIMIT) {
      const oldLedgers = await ctx.db
        .query("interpersonalLedgers")
        .withIndex("by_expires", (q) => q.lt("expiresAt", now))
        .take(Math.max(1, BATCH_LIMIT - deletedCount));
      for (const r of oldLedgers) {
        await ctx.db.delete(r._id);
        deletedCount++;
      }
    }

    if (deletedCount < BATCH_LIMIT) {
      const oldReservations = await ctx.db
        .query("handleReservations")
        .withIndex("by_expires", (q) =>
          q.gt("expiresAt", 0).lt("expiresAt", now)
        )
        .take(Math.max(1, BATCH_LIMIT - deletedCount));
      for (const r of oldReservations) {
        await ctx.db.delete(r._id);
        deletedCount++;
      }
    }

    if (deletedCount < BATCH_LIMIT) {
      const agedParking = await ctx.db
        .query("parkingReports")
        .withIndex("by_expires", (q) => q.lt("expiresAt", now - ONE_DAY_MS))
        .take(Math.max(1, BATCH_LIMIT - deletedCount));
      for (const r of agedParking) {
        await ctx.db.delete(r._id);
        deletedCount++;
      }
    }

    if (deletedCount < BATCH_LIMIT) {
      const agedPulses = await ctx.db
        .query("campusPulses")
        .withIndex("by_expires", (q) => q.lt("expiresAt", now - ONE_DAY_MS))
        .take(Math.max(1, BATCH_LIMIT - deletedCount));
      for (const r of agedPulses) {
        await ctx.db.delete(r._id);
        deletedCount++;
      }
    }

    if (deletedCount < BATCH_LIMIT) {
      const expiredListings = await ctx.db
        .query("listings")
        .withIndex("by_status_expires", (q) =>
          q.eq("status", "available").lt("expiresAt", now)
        )
        .take(Math.max(1, BATCH_LIMIT - deletedCount));
      for (const l of expiredListings) {
        await ctx.db.patch(l._id, {
          status: "expired",
          isBrowseable: false,
        });
        deletedCount++;
      }
    }

    return {
      deletedCount,
      hasMoreDemoRows,
    };
  },
});

export const runHourlyPurge = internalAction({
  args: {
    now: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ totalProcessed: number; rounds: number }> => {
    const now = args.now ?? Date.now();
    const collected = await ctx.runMutation(
      internal.housekeeping.collectPurgeableMediaKeys,
      { now }
    );

    if (collected.fileKeys.length > 0) {
      await ctx.runAction(internal.storageNode.deleteUploadThingFiles, {
        fileKeys: collected.fileKeys,
      });
    }

    let totalProcessed = 0;
    let rounds = 0;
    let keysToClear = collected.fileKeys;

    while (rounds < 10) {
      rounds++;
      const batch = await ctx.runMutation(
        internal.housekeeping.executePurgeBatch,
        {
          now,
          deletedFileKeys: keysToClear,
        }
      );
      keysToClear = [];
      totalProcessed += batch.deletedCount;
      if (!batch.hasMoreDemoRows && batch.deletedCount < BATCH_LIMIT) {
        break;
      }
    }

    return { totalProcessed, rounds };
  },
});
