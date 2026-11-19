import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { queueMediaDeletion } from "./lib/mediaCleanup";
import type { Doc, Id, TableNames } from "./_generated/dataModel";

const BATCH_LIMIT = 200;
const HOUR = 60 * 60 * 1000;

const v2StudentWorkspaceTables = [
  "incidentUpdates", "incidents", "appeals", "moderatorActions", "moderationNotices",
  "cloutEvents", "cloutWeeklyTotals", "cloutBoardCounts",
] as const;
const v2InstitutionalTables = ["alertItems", "alertSources"] as const;

const demoIndexes = {
  incidentUpdates: "by_purge",
  incidents: "by_purge",
  appeals: "by_purge",
  moderatorActions: "by_purge",
  moderationNotices: "by_purge",
  cloutEvents: "by_purge",
  cloutWeeklyTotals: "by_purge",
  cloutBoardCounts: "by_purge",
  alertItems: "by_purge",
  alertSources: "by_purge",
  scrappyMessages: "by_thread_created",
  scrappyThreads: "by_student_recent",
  chatMessages: "by_chat_seq",
  chatMembers: "by_chat_student",
  chats: "by_workspace_parent",
  savedInteractions: "by_student_kind_target",
  hashtagDailyCounts: "by_day_campus_count",
  parkingReports: "by_lot_active",
  campusPulses: "by_target_active",
  studySessions: "by_campus_end",
  studentEnrollments: "by_student_term",
  privateScheduleTerms: "by_student_term",
  agendaReminderState: "by_student",
  eventRsvps: "by_event_student",
  clubMembers: "by_club_student",
  moderationReports: "by_reporter",
  studentBlocks: "by_blocker",
  studentFollows: "by_follower",
  interpersonalLedgers: "by_pair_kind",
  handleReservations: "by_workspace_handle",
  listings: "by_seller",
  posts: "by_author",
  clubs: "by_workspace_slug",
  events: "by_all_start",
  students: "by_workspace_handle",
} satisfies Partial<Record<TableNames, string>>;

export const collectPurgeableMediaKeys = internalMutation({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const expiredDemos = await ctx.db
      .query("demoSessions")
      .withIndex("by_expires", (q) => q.lte("expiresAt", now))
      .take(5);

    const assets = new Map<string, Doc<"mediaAssets">>();
    const collect = (rows: Doc<"mediaAssets">[]) => {
      for (const asset of rows) assets.set(asset.fileKey, asset);
    };
    for (const demo of expiredDemos) {
      if (assets.size === BATCH_LIMIT) break;
      collect(await ctx.db
        .query("mediaAssets")
        .withIndex("by_demo_session", (q) => q.eq("demoSessionId", demo._id))
        .take(BATCH_LIMIT - assets.size));
    }

    if (assets.size < BATCH_LIMIT) {
      collect(await ctx.db.query("mediaAssets")
        .withIndex("by_status_created", (q) => q.eq("status", "deleted"))
        .take(BATCH_LIMIT - assets.size));
    }
    if (assets.size < BATCH_LIMIT) {
      collect(await ctx.db.query("mediaAssets")
        .withIndex("by_status_created", (q) => q.eq("status", "pending").lt("createdAt", now - 2 * HOUR))
        .take(BATCH_LIMIT - assets.size));
    }

    if (assets.size < BATCH_LIMIT - 2) {
      // Reserve at most three writes per held photo (discard, detach, claim).
      const held = await ctx.db.query("mediaAssets").withIndex("by_review_hold", (q) =>
        q.eq("workspaceKey", "prod").eq("reviewStatus", "held").gt("holdExpiresAt", 0).lte("holdExpiresAt", now))
        .take(Math.floor((BATCH_LIMIT - assets.size) / 3));
      for (const asset of held) {
        await ctx.db.patch(asset._id, { reviewStatus: "rejected", status: "deleted", url: "" });
        const incidents = await ctx.db.query("incidents").withIndex("by_photo", (q) =>
          q.eq("workspaceKey", asset.workspaceKey).eq("photoAssetId", asset._id)).take(1);
        for (const incident of incidents) await ctx.db.patch(incident._id, { photoAssetId: undefined });
      }
      collect(held);
    }

    // Claiming a pending upload prevents simultaneous attachment while storage is being cleaned.
    for (const asset of assets.values()) {
      if (asset.status !== "deleted" && asset.deleteClaimedAt === undefined) {
        await ctx.db.patch(asset._id, { deleteClaimedAt: now });
      }
    }
    return {
      fileKeys: Array.from(assets.keys()),
      assetIds: Array.from(assets.values(), (asset) => asset._id),
      expiredDemoIds: expiredDemos.map((demo) => demo._id),
    };
  },
});

export const executePurgeBatch = internalMutation({
  args: { now: v.optional(v.number()), deletedFileKeys: v.array(v.string()) },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    let deletedCount = 0;
    const budget = () => BATCH_LIMIT - deletedCount;
    const deleteRows = async (rows: ReadonlyArray<{ _id: Id<TableNames> }>) => {
      for (const row of rows) {
        await ctx.db.delete(row._id);
        deletedCount++;
      }
    };

    for (const fileKey of args.deletedFileKeys.slice(0, BATCH_LIMIT)) {
      const asset = await ctx.db
        .query("mediaAssets")
        .withIndex("by_file_key", (q) => q.eq("fileKey", fileKey))
        .unique();
      if (asset && (asset.status === "deleted" || asset.deleteClaimedAt !== undefined)) {
        await deleteRows([asset]);
      }
    }

    const expiredDemos = await ctx.db
      .query("demoSessions")
      .withIndex("by_expires", (q) => q.lte("expiresAt", now))
      .take(6);
    let hasMoreDemoRows = expiredDemos.length > 5;
    for (const demo of expiredDemos.slice(0, 5)) {
      if (budget() === 0) {
        hasMoreDemoRows = true;
        break;
      }
      const assets = await ctx.db.query("mediaAssets")
        .withIndex("by_demo_session", (q) => q.eq("demoSessionId", demo._id))
        .take(budget());
      for (const asset of assets) {
        await queueMediaDeletion(ctx, asset);
        deletedCount++;
      }

      for (const [table, index] of Object.entries(demoIndexes)) {
        if (budget() === 0) break;
        // Each index in this map starts with workspaceKey.
        const rows = await ctx.db.query(table as keyof typeof demoIndexes)
          .withIndex(index as never, (q: any) => q.eq("workspaceKey", `demo:${demo._id}`))
          .take(budget());
        await deleteRows(rows);
      }
      if (budget() > 0) {
        const leases = await ctx.db.query("uploadReservations")
          .withIndex("by_demo_session", (q) => q.eq("demoSessionId", demo._id))
          .take(budget());
        await deleteRows(leases);
      }
      if (budget() === 0) {
        hasMoreDemoRows = true;
        break;
      }
      await deleteRows([demo]);
    }

    for (const table of [...v2StudentWorkspaceTables, "moderators"] as const) {
      if (budget() <= 0) break;
      if (table === "incidents") {
        const incidents = await ctx.db.query("incidents").withIndex("by_purge", (q) =>
          q.eq("workspaceKey", "prod").gt("purgeAt", 0).lte("purgeAt", now)).take(Math.floor(budget() / 2));
        for (const incident of incidents) {
          if (incident.photoAssetId) {
            const asset = await ctx.db.get(incident.photoAssetId);
            if (asset?.workspaceKey === incident.workspaceKey) {
              await queueMediaDeletion(ctx, asset);
              deletedCount++;
            }
          }
          await deleteRows([incident]);
        }
      } else {
        await deleteRows(await ctx.db.query(table).withIndex("by_purge", (q) =>
          q.eq("workspaceKey", "prod").gt("purgeAt", 0).lte("purgeAt", now)).take(budget()));
      }
    }
    for (const table of v2InstitutionalTables) {
      if (budget() <= 0) break;
      await deleteRows(await ctx.db.query(table).withIndex("by_purge", (q) =>
        q.eq("workspaceKey", "ksu").gt("purgeAt", 0).lte("purgeAt", now)).take(budget()));
    }
    if (budget() > 0) {
      const snapshots = await ctx.db.query("moderatorActions").withIndex("by_snapshot_purge", (q) =>
        q.eq("workspaceKey", "prod").gt("snapshotPurgeAt", 0).lte("snapshotPurgeAt", now)).take(budget());
      for (const snapshot of snapshots) {
        await ctx.db.patch(snapshot._id, { contentSnapshot: undefined, snapshotPurgeAt: undefined });
        deletedCount++;
      }
    }

    const pruneQueries = [
      () => ctx.db.query("uploadReservations").withIndex("by_expires", (q) => q.lte("expiresAt", now)),
      () => ctx.db.query("emailOtps").withIndex("by_expires", (q) => q.lt("expiresAt", now - HOUR)),
      () => ctx.db.query("studentSessions").withIndex("by_expires", (q) => q.lte("expiresAt", now)),
      () => ctx.db.query("rateLimitBuckets").withIndex("by_expires", (q) => q.lte("expiresAt", now)),
      () => ctx.db.query("interpersonalLedgers").withIndex("by_expires", (q) => q.lte("expiresAt", now)),
      () => ctx.db.query("handleReservations").withIndex("by_expires", (q) => q.gt("expiresAt", 0).lte("expiresAt", now)),
      () => ctx.db.query("parkingReports").withIndex("by_expires", (q) => q.lt("expiresAt", now - 24 * HOUR)),
      () => ctx.db.query("campusPulses").withIndex("by_expires", (q) => q.lt("expiresAt", now - 24 * HOUR)),
    ];
    for (const query of pruneQueries) {
      if (budget() === 0) break;
      await deleteRows(await query().take(budget()));
    }
    if (budget() > 0) {
      const listings = await ctx.db.query("listings")
        .withIndex("by_status_expires", (q) => q.eq("status", "available").lte("expiresAt", now))
        .take(budget());
      for (const listing of listings) {
        await ctx.db.patch(listing._id, { status: "expired", isBrowseable: false });
        deletedCount++;
      }
    }
    return { deletedCount, hasMoreDemoRows };
  },
});

export const runHourlyPurge = internalAction({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ totalProcessed: number; rounds: number }> => {
    const now = args.now ?? Date.now();
    let totalProcessed = 0;
    let rounds = 0;
    while (rounds < 10) {
      rounds++;
      const { fileKeys } = await ctx.runMutation(internal.housekeeping.collectPurgeableMediaKeys, { now });
      const { deletedFileKeys } = fileKeys.length
        ? await ctx.runAction(internal.storageNode.deleteUploadThingFiles, { fileKeys })
        : { deletedFileKeys: [] };
      const batch = await ctx.runMutation(internal.housekeeping.executePurgeBatch, { now, deletedFileKeys });
      totalProcessed += batch.deletedCount;
      if (!batch.hasMoreDemoRows && batch.deletedCount < BATCH_LIMIT) break;
    }
    return { totalProcessed, rounds };
  },
});
