import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import {
  canonicalizeKsuEmail,
  randomHex,
  randomNumericOtp,
  sha256Hex,
} from "./lib/crypto";
import {
  parseMaintainerEmails,
  publicAuthMutation,
  toPublicStudent,
  viewerMutation,
} from "./lib/viewer";
import { mintBrowserCredential, requireServerSecret } from "./lib/sessionCredential";
import { hasSuspensionAppealAccess } from "./lib/moderationPolicy";

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 1 resend / 60s
const EMAIL_ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000; // 5 OTPs / 24h
const IP_ROLLING_WINDOW_MS = 60 * 60 * 1000; // 10 OTPs / hr
const MAX_EMAIL_OTPS_24H = 5;
const MAX_IP_OTPS_1H = 10;
const MAX_OTP_ATTEMPTS = 5;
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const requestEmailOtp = publicAuthMutation({
  args: {
    email: v.string(),
    clientNetwork: v.string(),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    await requireServerSecret(args.serverSecret);
    const now = Date.now();
    const parsed = canonicalizeKsuEmail(args.email);
    if (!parsed.ok) {
      throw new ConvexError({
        code: "INVALID_EMAIL_DOMAIN",
        message: parsed.error,
      });
    }

    const { canonicalEmail } = parsed;
    const emailHash = await sha256Hex(canonicalEmail);

    // Block permanently suspended .edu accounts from requesting OTPs
    const suspendedEmailLock = await ctx.db
      .query("handleReservations")
      .withIndex("by_blocked_email_hash", (q) =>
        q.eq("workspaceKey", "prod").eq("blockedEmailHash", emailHash)
      )
      .first();
    if (suspendedEmailLock) {
      throw new ConvexError({
        code: "ACCOUNT_SUSPENDED",
        message: "This KSU .edu account has been suspended from OwlSide.",
      });
    }

    const existingStudent = await ctx.db
      .query("students")
      .withIndex("by_prod_email", (q) =>
        q.eq("workspaceKey", "prod").eq("canonicalEmail", canonicalEmail)
      )
      .unique();
    if (existingStudent && existingStudent.accountStatus === "suspended" && !await hasSuspensionAppealAccess(ctx, existingStudent._id, now)) {
      throw new ConvexError({
        code: "ACCOUNT_SUSPENDED",
        message: "This KSU .edu account has been suspended from OwlSide.",
      });
    }

    // Check 1 resend / 60s and 5 OTPs / rolling 24h per canonical email
    const recentEmailOtps = await ctx.db
      .query("emailOtps")
      .withIndex("by_email", (q) =>
        q
          .eq("canonicalEmail", canonicalEmail)
          .gt("createdAt", now - EMAIL_ROLLING_WINDOW_MS)
      )
      .order("desc")
      .take(10);

    if (
      recentEmailOtps[0] &&
      now - recentEmailOtps[0].createdAt < RESEND_COOLDOWN_MS
    ) {
      throw new ConvexError({
        code: "RATE_LIMITED",
        message: "Please wait 60 seconds before requesting another login code.",
      });
    }

    if (recentEmailOtps.length >= MAX_EMAIL_OTPS_24H) {
      throw new ConvexError({
        code: "RATE_LIMITED",
        message: "Maximum of 5 verification codes per 24 hours reached.",
      });
    }

    // Check 10 OTPs / hr per hashed IP
    const ipHash = await sha256Hex(`owlside-otp-network:${args.serverSecret}:${args.clientNetwork}`);
    const ipBucketKey = `otp_ip:${ipHash}`;
    const ipBucket = await ctx.db
      .query("rateLimitBuckets")
      .withIndex("by_key", (q) => q.eq("key", ipBucketKey))
      .unique();

    if (ipBucket && ipBucket.expiresAt > now) {
      if (ipBucket.count >= MAX_IP_OTPS_1H) {
        throw new ConvexError({
          code: "RATE_LIMITED",
          message: "Too many OTP requests from this network. Try again in 1 hour.",
        });
      }
      await ctx.db.patch(ipBucket._id, {
        count: ipBucket.count + 1,
      });
    } else if (ipBucket) {
      await ctx.db.patch(ipBucket._id, {
        count: 1,
        windowStart: now,
        expiresAt: now + IP_ROLLING_WINDOW_MS,
      });
    } else {
      await ctx.db.insert("rateLimitBuckets", {
        key: ipBucketKey,
        count: 1,
        windowStart: now,
        expiresAt: now + IP_ROLLING_WINDOW_MS,
      });
    }

    // Invalidate any previous active OTPs for this canonicalEmail
    for (const prev of recentEmailOtps) {
      if (!prev.invalidated && prev.expiresAt > now) {
        await ctx.db.patch(prev._id, { invalidated: true });
      }
    }

    const code = randomNumericOtp();
    const codeHash = await sha256Hex(code);

    await ctx.db.insert("emailOtps", {
      canonicalEmail,
      codeHash,
      attempts: 0,
      ipHash,
      invalidated: false,
      createdAt: now,
      expiresAt: now + OTP_TTL_MS,
    });

    if (process.env.OWLSIDE_SKIP_OTP_SCHEDULER !== "true") {
      await ctx.scheduler.runAfter(0, internal.authNode.sendOtpEmailAction, {
        canonicalEmail,
        code,
      });
    }

    const isDevOtpVisible =
      process.env.NODE_ENV !== "production" &&
      process.env.OWLSIDE_ALLOW_DEV_OTP_LOG === "true";

    return {
      ok: true,
      expiresAt: now + OTP_TTL_MS,
      ...(isDevOtpVisible ? { devCodePreview: code } : {}),
    };
  },
});

export const verifyEmailOtp = publicAuthMutation({
  args: {
    email: v.string(),
    code: v.string(),
    userAgent: v.optional(v.string()),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    await requireServerSecret(args.serverSecret);
    const now = Date.now();
    const parsed = canonicalizeKsuEmail(args.email);
    if (!parsed.ok) {
      throw new ConvexError({
        code: "INVALID_EMAIL_DOMAIN",
        message: parsed.error,
      });
    }

    const { canonicalEmail, emailDomainBadge } = parsed;
    const emailHash = await sha256Hex(canonicalEmail);

    const suspendedLock = await ctx.db
      .query("handleReservations")
      .withIndex("by_blocked_email_hash", (q) =>
        q.eq("workspaceKey", "prod").eq("blockedEmailHash", emailHash)
      )
      .first();
    if (suspendedLock) {
      throw new ConvexError({
        code: "ACCOUNT_SUSPENDED",
        message: "This KSU .edu account has been suspended from OwlSide.",
      });
    }

    const latestOtp = await ctx.db
      .query("emailOtps")
      .withIndex("by_email", (q) => q.eq("canonicalEmail", canonicalEmail))
      .order("desc")
      .first();

    if (
      !latestOtp ||
      latestOtp.expiresAt <= now ||
      latestOtp.invalidated ||
      latestOtp.attempts >= MAX_OTP_ATTEMPTS
    ) {
      return {
        ok: false as const,
        code: "OTP_EXPIRED_OR_LOCKED" as const,
        message:
          "Verification code expired or invalidated after 5 failed attempts. Request a new code.",
        attemptsRemaining: 0,
      };
    }

    const cleanCode = args.code.trim();
    const candidateHash = await sha256Hex(cleanCode);

    if (candidateHash !== latestOtp.codeHash) {
      const nextAttempts = latestOtp.attempts + 1;
      const locked = nextAttempts >= MAX_OTP_ATTEMPTS;
      await ctx.db.patch(latestOtp._id, {
        attempts: nextAttempts,
        ...(locked ? { invalidated: true } : {}),
      });
      return {
        ok: false as const,
        code: locked ? ("OTP_LOCKED" as const) : ("INVALID_OTP" as const),
        message: locked
          ? "Too many incorrect attempts. This code has been invalidated."
          : `Incorrect 6-digit code (${MAX_OTP_ATTEMPTS - nextAttempts} attempts left).`,
        attemptsRemaining: Math.max(0, MAX_OTP_ATTEMPTS - nextAttempts),
      };
    }

    // Valid OTP — consume immediately so it cannot be replayed
    await ctx.db.patch(latestOtp._id, {
      invalidated: true,
    });

    let student = await ctx.db
      .query("students")
      .withIndex("by_prod_email", (q) =>
        q.eq("workspaceKey", "prod").eq("canonicalEmail", canonicalEmail)
      )
      .unique();

    const appealAccess = Boolean(student?.accountStatus === "suspended" && await hasSuspensionAppealAccess(ctx, student._id, now));
    if (student && student.accountStatus === "suspended" && !appealAccess) {
      throw new ConvexError({
        code: "ACCOUNT_SUSPENDED",
        message: "This KSU .edu account has been suspended from OwlSide.",
      });
    }

    if (!student || (student.accountStatus !== "active" && !appealAccess)) {
      const tempSuffix = randomHex(4);
      const tempHandle = `owl_${tempSuffix}`;
      const studentId = await ctx.db.insert("students", {
        workspaceKey: "prod",
        canonicalEmail,
        emailDomainBadge,
        handle: tempHandle,
        handleLower: tempHandle,
        displayName: "New KSU Owl",
        searchText: `@${tempHandle} New KSU Owl`,
        homeCampus: "Kennesaw",
        activeCampusFilter: "Kennesaw",
        pinnedParkingLotIds: [],
        completedDealCount: 0,
        onboardingCompleted: false,
        accountStatus: "active",
        joinedAt: now,
      });
      student = (await ctx.db.get(studentId))!;
    }

    const sessionToken = randomHex(32); // 256-bit opaque token
    const tokenHash = await sha256Hex(sessionToken);
    const sessionExpiresAt = now + SESSION_DURATION_MS;

    await ctx.db.insert("studentSessions", {
      tokenHash,
      studentId: student._id,
      createdAt: now,
      lastRefreshedAt: now,
      expiresAt: sessionExpiresAt,
      userAgent: args.userAgent,
    });

    return {
      ok: true as const,
      sessionToken,
      student: toPublicStudent(student),
      needsOnboarding: student.onboardingCompleted === false,
      isModerator: parseMaintainerEmails(process.env.OWLSIDE_MAINTAINER_EMAILS).has(canonicalEmail),
      sessionExpiresAt,
      ...await mintBrowserCredential(tokenHash, sessionExpiresAt, now),
    };
  },
});

export const getBrowserSession = viewerMutation({
  allowSuspended: true,
  args: { serverSecret: v.string() },
  handler: async (ctx, args) => {
    await requireServerSecret(args.serverSecret);
    const { isBrowserCredential, studentSessionTokenHash, studentSessionExpiresAt, actorStudent, isModerator } = ctx.viewer;
    if (isBrowserCredential || !studentSessionTokenHash || !studentSessionExpiresAt) {
      throw new ConvexError({ code: "UNAUTHENTICATED", message: "A valid Student session cookie is required." });
    }
    return {
      ...await mintBrowserCredential(studentSessionTokenHash, studentSessionExpiresAt, Date.now()),
      sessionExpiresAt: studentSessionExpiresAt,
      student: toPublicStudent(actorStudent),
      isModerator,
    };
  },
});

export const signOutSession = viewerMutation({
  allowSuspended: true,
  args: { pushEndpoint: v.optional(v.string()) },
  handler: async (ctx, args) => {
    let pushRemoved = false;
    if (ctx.viewer.studentSessionId) {
      const endpoint = args.pushEndpoint?.trim();
      if (endpoint) {
        const subscription = await ctx.db.query("pushSubscriptions")
          .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
          .unique();
        if (subscription?.studentId === ctx.viewer.actorStudent._id) {
          await ctx.db.delete(subscription._id);
          pushRemoved = true;
        }
      }
      await ctx.db.delete(ctx.viewer.studentSessionId);
    }
    return { ok: true, pushRemoved };
  },
});
