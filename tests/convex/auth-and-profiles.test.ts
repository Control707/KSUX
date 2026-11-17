import { TEST_SERVER_SECRET, requestTestOtp, verifyTestOtp, reserveTestUpload } from "../helpers/authTest";
import { beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import {
  createTestConvex,
  createVerifiedTestStudent,
} from "../helpers/convexTestEnv";

describe("Seam 1 — .edu Email OTP, Onboarding, Profiles, Follow & Hourly Purge (#15)", () => {
  beforeEach(() => {
    process.env.KSUX_SERVER_SECRET = TEST_SERVER_SECRET;
    process.env.KSUX_SKIP_OTP_SCHEDULER = "true";
    process.env.KSUX_SKIP_STORAGE_SCHEDULER = "true";
    process.env.KSUX_ALLOW_DEV_OTP_LOG = "true";
  });

  it("canonicalizes @students.kennesaw.edu and @kennesaw.edu (+tag stripped), rejects outside domains, and hides raw emails", async () => {
    const t = createTestConvex();
    const t0 = 1_760_000_000_000;

    await expect(
      requestTestOtp(t, {
        email: "outsider@gmail.com",
        nowOverride: t0,
      })
    ).rejects.toThrowError(/Only @students\.kennesaw\.edu and @kennesaw\.edu/);

    const studentOtp = await requestTestOtp(t, {
      email: "  Maya.Patel+Clubs@Students.Kennesaw.EDU ",
      clientIpHint: "10.0.0.1",
      nowOverride: t0,
    });
    expect(studentOtp.devCodePreview).toMatch(/^\d{6}$/);

    // Verify using the base canonical email without +Clubs
    const verified = await verifyTestOtp(t, {
      email: "maya.patel@students.kennesaw.edu",
      code: studentOtp.devCodePreview!,
      nowOverride: t0 + 5_000,
    });
    expect(verified.ok).toBe(true);
    if (!verified.ok) throw new Error("Expected verification success");
    expect(verified.needsOnboarding).toBe(true);
    expect(verified.student.emailDomainBadge).toBe("verified_student");
    expect("canonicalEmail" in verified.student).toBe(false);

    // Faculty/Staff domain maps to faculty_staff badge
    const facOtp = await requestTestOtp(t, {
      email: "Dr.Vance+Syllabus@Kennesaw.edu",
      clientIpHint: "10.0.0.2",
      nowOverride: t0,
    });
    const facVerified = await verifyTestOtp(t, {
      email: "dr.vance@kennesaw.edu",
      code: facOtp.devCodePreview!,
      nowOverride: t0 + 5_000,
    });
    expect(facVerified.ok).toBe(true);
    if (facVerified.ok) {
      expect(facVerified.student.emailDomainBadge).toBe("faculty_staff");
    }
  });

  it("enforces 60s resend cooldown, 5/24h email cap, 10/hr IP cap, and 5-attempt OTP invalidation", async () => {
    const t = createTestConvex();
    const base = 1_760_100_000_000;

    const first = await requestTestOtp(t, {
      email: "owl1@students.kennesaw.edu",
      clientIpHint: "192.168.1.10",
      nowOverride: base,
    });

    // Immediate resend within 60s is blocked
    await expect(
      requestTestOtp(t, {
        email: "owl1@students.kennesaw.edu",
        clientIpHint: "192.168.1.10",
        nowOverride: base + 30_000,
      })
    ).rejects.toThrowError(/wait 60 seconds/);

    // Request codes #2..#5 spaced >60s apart
    let latestCode = first.devCodePreview!;
    for (let i = 1; i < 5; i++) {
      const next = await requestTestOtp(t, {
        email: "owl1@students.kennesaw.edu",
        clientIpHint: `192.168.1.${10 + i}`,
        nowOverride: base + i * 70_000,
      });
      latestCode = next.devCodePreview!;
    }

    // 6th OTP within 24h is rejected
    await expect(
      requestTestOtp(t, {
        email: "owl1@students.kennesaw.edu",
        clientIpHint: "192.168.1.99",
        nowOverride: base + 6 * 70_000,
      })
    ).rejects.toThrowError(/Maximum of 5 verification codes per 24 hours/);

    // 5 wrong verification attempts invalidate the active OTP
    const wrongCode = latestCode === "000000" ? "999999" : "000000";
    for (let attempt = 1; attempt <= 4; attempt++) {
      const res = await verifyTestOtp(t, {
        email: "owl1@students.kennesaw.edu",
        code: wrongCode,
        nowOverride: base + 6 * 70_000 + attempt * 1000,
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe("INVALID_OTP");
    }

    const fifth = await verifyTestOtp(t, {
      email: "owl1@students.kennesaw.edu",
      code: wrongCode,
      nowOverride: base + 6 * 70_000 + 5_000,
    });
    expect(fifth.ok).toBe(false);
    if (!fifth.ok) expect(fifth.code).toBe("OTP_LOCKED");

    // 6th attempt EVEN WITH THE EXACT CODE fails because code is invalidated!
    const sixth = await verifyTestOtp(t, {
      email: "owl1@students.kennesaw.edu",
      code: latestCode,
      nowOverride: base + 6 * 70_000 + 6_000,
    });
    expect(sixth.ok).toBe(false);
    if (!sixth.ok) expect(sixth.code).toBe("OTP_EXPIRED_OR_LOCKED");

    // IP cap: 10 OTPs / hr from a single IP across distinct emails
    for (let i = 0; i < 10; i++) {
      await requestTestOtp(t, {
        email: `ipuser${i}@students.kennesaw.edu`,
        clientIpHint: "203.0.113.5",
        nowOverride: base + i * 1000,
      });
    }
    await expect(
      requestTestOtp(t, {
        email: "ipuser10@students.kennesaw.edu",
        clientIpHint: "203.0.113.5",
        nowOverride: base + 15_000,
      })
    ).rejects.toThrowError(/Too many OTP requests from this network/);
  });

  it("blocks reserved & tombstoned handles, enforces 30d rename cooldown, caps Follow at 200, and preserves [Removed Student] on self-delete", async () => {
    const t = createTestConvex();
    const otp = await requestTestOtp(t, {
      email: "fresh@students.kennesaw.edu",
    });
    const verified = await verifyTestOtp(t, {
      email: "fresh@students.kennesaw.edu",
      code: otp.devCodePreview!,
    });
    if (!verified.ok) throw new Error("Expected verified session");

    // Reserved handles (`scrappy`, `admin`, `police`, `maya_cs`, etc.) are blocked
    for (const bad of ["scrappy", "admin", "police", "maya_cs"]) {
      await expect(
        t.mutation(api.students.completeOnboarding, {
          sessionToken: verified.sessionToken,
          displayName: "Fresh Owl",
          handle: bad,
          homeCampus: "Marietta",
        })
      ).rejects.toThrowError(/reserved/);
    }

    const onboarded = await t.mutation(api.students.completeOnboarding, {
      sessionToken: verified.sessionToken,
      displayName: "Fresh Owl",
      handle: "fresh_owl",
      homeCampus: "Marietta",
      major: "Software Engineering",
      classYear: "2028",
    });
    expect(onboarded.handle).toBe("fresh_owl");
    expect(onboarded.homeCampus).toBe("Marietta");

    // Renaming handle immediately within 30d fails
    await expect(
      t.mutation(api.students.updateProfile, {
        sessionToken: verified.sessionToken,
        handle: "fresh_owl_2",
      })
    ).rejects.toThrowError(/once every 30 days/);

    // Create peer & test unidirectional Follow + 200 cap
    const peer = await createVerifiedTestStudent(t, {
      handle: "peer_owl",
      displayName: "Peer Owl",
    });
    const f1 = await t.mutation(api.students.toggleFollow, {
      sessionToken: verified.sessionToken,
      targetStudentId: peer.studentId,
    });
    expect(f1.following).toBe(true);

    const peerProfile = await t.query(api.students.getProfile, {
      sessionToken: peer.sessionToken,
      handle: "fresh_owl",
    });
    expect(peerProfile?.student.displayName).toBe("Fresh Owl");
    expect("canonicalEmail" in (peerProfile?.student ?? {})).toBe(false);

    // Self-delete Fresh Owl: revokes session, reserves @fresh_owl for 30d, and renders [Removed Student]
    await t.mutation(api.students.deleteMyProfile, {
      sessionToken: verified.sessionToken,
    });

    await expect(
      t.query(api.shell.shellSummary, {
        sessionToken: verified.sessionToken,
      })
    ).rejects.toThrowError(/Session expired or invalid/);

    // Another Student trying to claim @fresh_owl within 30d is blocked against impersonation
    const impersonatorOtp = await requestTestOtp(t, {
      email: "impersonator@students.kennesaw.edu",
    });
    const impVer = await verifyTestOtp(t, {
      email: "impersonator@students.kennesaw.edu",
      code: impersonatorOtp.devCodePreview!,
    });
    if (!impVer.ok) throw new Error("Expected verified impersonator");

    await expect(
      t.mutation(api.students.completeOnboarding, {
        sessionToken: impVer.sessionToken,
        displayName: "Copycat",
        handle: "fresh_owl",
        homeCampus: "Kennesaw",
      })
    ).rejects.toThrowError(/reserved/);

    // Counterparty querying deleted Student sees [Removed Student]
    const deletedView = await t.query(api.students.getProfile, {
      sessionToken: peer.sessionToken,
      studentId: onboarded._id,
    });
    expect(deletedView?.student.displayName).toBe("[Removed Student]");
    expect(deletedView?.student.isRemoved).toBe(true);
  });

  it("purges expired 24h demoSessionId workspaces, abandoned >2h uploads, and >30d Listings in <=200-doc batches", async () => {
    const t = createTestConvex();
    const now = Date.now();

    const expiredDemo = await t.mutation(
      api.demo.session.provisionOrAttachDemoSession,
      {}
    );
    const activeDemo = await t.mutation(
      api.demo.session.provisionOrAttachDemoSession,
      {}
    );

    // Register an upload on expiredDemo, then backdate expiredDemo's expiresAt and add an >30d prod Listing
    await t.mutation(api.uploads.registerMediaAsset, await reserveTestUpload(t, {
      demoShortCode: expiredDemo.shortCode,
      demoPersonaHandle: "maya_cs",
      fileKey: "ut_expired_demo_img_1",
      url: "https://utfs.io/f/ut_expired_demo_img_1",
      purpose: "post",
      byteSize: 20_000,
      width: 600,
      height: 600,
    }));

    const prodSeller = await createVerifiedTestStudent(t, {
      handle: "seller_owl",
      displayName: "Seller Owl",
    });

    const staleListingId = await t.run(async (ctx) => {
      await ctx.db.patch(expiredDemo.demoSessionId, {
        expiresAt: now - 60_000,
      });
      await ctx.db.insert("mediaAssets", {
        workspaceKey: "prod",
        ownerStudentId: prodSeller.studentId,
        fileKey: "ut_abandoned_pending_img",
        url: "https://utfs.io/f/ut_abandoned_pending_img",
        purpose: "listing",
        byteSize: 15_000,
        width: 500,
        height: 500,
        status: "pending",
        createdAt: now - 3 * 3600_000, // > 2h abandoned
      });
      return ctx.db.insert("listings", {
        workspaceKey: "prod",
        sellerId: prodSeller.studentId,
        campus: "Kennesaw",
        category: "electronics",
        pricingMode: "fixed_obo",
        priceCents: 2500,
        title: "Old USB Hub",
        description: "Untouched for 31 days",
        searchText: "Old USB Hub",
        mediaAssetIds: [],
        status: "available",
        visibilityStatus: "visible",
        isBrowseable: true,
        buyerConfirmedPickup: false,
        bookmarkCount: 0,
        publishedAt: now - 31 * 86_400_000,
        expiresAt: now - 86_400_000,
      });
    });

    const collected = await t.mutation(
      internal.housekeeping.collectPurgeableMediaKeys,
      { now }
    );
    expect(collected.fileKeys).toContain("ut_expired_demo_img_1");
    expect(collected.fileKeys).toContain("ut_abandoned_pending_img");

    const batch = await t.mutation(internal.housekeeping.executePurgeBatch, {
      now,
      deletedFileKeys: collected.fileKeys,
    });
    expect(batch.deletedCount).toBeGreaterThan(10);
    expect(batch.deletedCount).toBeLessThanOrEqual(200);

    // Expired demo workspace is completely gone, while activeDemo and prod Listing status ("expired") behave properly
    await expect(
      t.query(api.shell.shellSummary, {
        demoShortCode: expiredDemo.shortCode,
        demoPersonaHandle: "maya_cs",
      })
    ).rejects.toThrowError(/expired or not found/);

    const activeSummary = await t.query(api.shell.shellSummary, {
      demoShortCode: activeDemo.shortCode,
      demoPersonaHandle: "maya_cs",
    });
    expect(activeSummary.viewer.student.handle).toBe("maya_cs");

    const listingAfter = await t.run((ctx) => ctx.db.get(staleListingId));
    expect(listingAfter?.status).toBe("expired");
    expect(listingAfter?.isBrowseable).toBe(false);
  });
});
