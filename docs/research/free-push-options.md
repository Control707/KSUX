# $0-compatible push notification options for campus-wide Alerts

- **Date:** 2026-11-17
- **Ticket:** [Control707/KSUX#42](https://github.com/Control707/KSUX/issues/42) (part of map [#35](https://github.com/Control707/KSUX/issues/35))
- **Branch:** `research/free-push-options` (research only; never merged)
- **Constraints read first:** [GLOSSARY.md](../../GLOSSARY.md), [SPEC §1–2](../SPEC.md) ($0 total cost, no credit-card-gated services, zero KSU IT approvals, Next.js PWA on Vercel Hobby + Convex Free), [ADR-0005](../adr/0005-diff-gated-sync-read-time-expiry-and-read-only-commuter-pwa.md) (VAPID push scoped to handle-only personal events), and prior research: [campus-safety.md](campus-safety.md), [campus-safety-alert-ingestion.md](campus-safety-alert-ingestion.md), [campus-safety-handoffs.md](campus-safety-handoffs.md), [campus-safety-community-feed.md](campus-safety-community-feed.md). Those notes already established that KSU Alert (Rave) is the official emergency channel and that emergency Web Push would reopen Decision #10 / ADR-0005; this note does not redo that work.

## Question

What are the $0-compatible push notification options for a Next.js PWA delivering safety Alerts to many Students, and their real limits — self-hosted VAPID Web Push, free hosted services (FCM, OneSignal), critical/time-sensitive semantics, and fallbacks (in-app, Gmail SMTP, SMS)?

## Executive answer

1. **Self-hosted VAPID Web Push (already in the repo via `web-push`) is the only option that is both $0 and adds no new data processor.** Browser push services charge nothing and Apple does not require the Apple Developer Program ([WebKit, Meet Web Push](https://webkit.org/blog/12945/meet-web-push/)). The cost sits on KSUX's own quotas: one encrypted HTTPS POST per subscription. At 5k–40k subscribers, a single blast is comfortably within Convex Free's compute; the binding constraints are Convex's **1 GB/month database I/O** and the **10-minute Node action limit**, so a fan-out must be batched/scheduled (estimates below).
2. **Firebase Cloud Messaging is genuinely no-cost and card-free** on the Spark plan ([Firebase pricing](https://firebase.google.com/pricing): "No payment method needed"; "Cloud Messaging (FCM) No-cost"), with topic fan-out handled by Google. For web it still rides the same browser push services (it uses VAPID keys — [FCM web get-started](https://firebase.google.com/docs/cloud-messaging/web/get-started)), so it gains fan-out offload but **no extra iOS reach, priority, or reliability**, and adds Google as a processor of installation IDs.
3. **OneSignal Free** is $0 but caps web push at **"Max 10,000 subscribers per send"** ([OneSignal pricing](https://onesignal.com/pricing)) — below KSU-scale audiences — and its SDK collects IP address, inferred geolocation, and page-visit data ([OneSignal privacy policy](https://onesignal.com/privacy_policy)). Card requirement for the free plan: **unverified**.
4. **There is no "critical alert" or "time-sensitive" level on the web.** Apple's critical-alert behavior (sound through mute/Do Not Disturb) is a native entitlement that must be requested from Apple ([Apple: Critical Alerts entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.usernotifications.critical-alerts)); `timeSensitive`/`critical` interruption levels exist only in the native `UserNotifications` API ([UNNotificationInterruptionLevel](https://developer.apple.com/documentation/usernotifications/unnotificationinterruptionlevel)). The web `NotificationOptions` dictionary has no equivalent field ([WHATWG Notifications](https://notifications.spec.whatwg.org/)), and Home Screen web-app notifications are subject to Focus ([WebKit iOS 16.4](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)). Web push's `Urgency: high` (RFC 8030) is a battery/delivery hint to the push service, not a bypass of user/OS silencing.
5. **Fallbacks:** in-app banners are free but only reach open sessions; Gmail SMTP is capped at **500 emails/day** for consumer accounts ([Gmail sending limits](https://support.google.com/mail/answer/22839?hl=en)) — at most one small cohort per day, and it competes with OTP login email; SMS is paid (e.g., Twilio US outbound **$0.0083/segment** — [Twilio US pricing](https://www.twilio.com/en-us/sms/pricing/us)) and therefore out of budget.
6. **Bottom line:** every $0 option is best-effort, opt-in, and unacknowledged. Primary specs and vendor docs support saying **KSUX push cannot be a reliable emergency channel**; it can at most be a supplementary pointer to official KSU Alert content, and only after Decision #10 / ADR-0005 are deliberately reopened.

## Findings

### 1. Self-hosted VAPID Web Push (current KSUX mechanism)

**What exists in the repo.** `web-push` is a dependency ([package.json](../../package.json)); [pushAdapter.ts:29–72](../../convex/lib/pushAdapter.ts#L29-L72) allows only `dm`, `message_request`, `deal`, `scrappy_reply` and rejects anything else as `high_fanout_suppressed`; [pushAdapter.ts:109–136](../../convex/lib/pushAdapter.ts#L109-L136) sends sequentially to at most 3 endpoints per Student, counts a resolved request as `delivered`, and collects 404/410 endpoints as stale. A campus-wide Alert is therefore **not supported today by design** ([ADR-0005](../adr/0005-diff-gated-sync-read-time-expiry-and-read-only-commuter-pwa.md)), and the existing `delivered` counter means "push service accepted," not "device displayed."

**Protocol facts (RFC 8030, IETF Standards Track — [RFC 8030](https://www.rfc-editor.org/rfc/rfc8030)):**
- A `201 Created` from the push service "does not indicate that the message was delivered to the user agent" (§5). Delivery receipts exist in the protocol (§5.1, `Prefer: respond-async`) but neither the W3C Push API nor `web-push` exposes them to KSUX in practice — **unverified per push service**; treat as unavailable.
- `TTL` is mandatory; the push service "MAY retain a push message for a shorter duration than requested," and after TTL "MUST NOT attempt to deliver" (§5.2). A device offline longer than the TTL simply never gets the alert (§7.2).
- `Urgency` (`very-low`…`high`) is optional; the user agent may ask the push service to withhold lower-urgency messages (§5.3). It is a power-management hint, not an emergency override.
- "A push service MAY expire a subscription at any time" and returns 404 for sends to expired subscriptions (§7.3); push services "MAY return a 429" with `Retry-After` for rate limiting (§8.4).
- "Intentional failure to deliver messages is difficult to distinguish from faults, which might occur due to transient network errors, interruptions in user agent availability, or genuine service outages" (§8.4).
- Payloads ≤4096 bytes must be accepted (§7.2) — fine for a handle-only/headline payload.

**W3C Push API ([2026-11-16 Working Draft](https://www.w3.org/TR/push-api/)):** "Push messages usually have higher latency than direct communications and they can also be subject to restrictions on use. Most push services limit the size and quantity of push messages that can be sent." (§1). Subscriptions may carry an expiration time after which they are deactivated (§3). The document is a Working Draft ("inappropriate to cite … as other than a work in progress"). Already cited as [S14] in [campus-safety.md](campus-safety.md).

**iOS/iPadOS (primary: WebKit):**
- Web Push works for **Home Screen web apps only**, iOS/iPadOS 16.4+; permission "can request permission … as long as that request is in response to direct user interaction"; notifications "integrate with Focus"; delivered via APNs; no Apple Developer Program membership needed ([WebKit, 2023-02-16](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)).
- Safari requires `userVisibleOnly: true`; "Violations of the userVisibleOnly promise will result in a push subscription being revoked" ([WebKit, Meet Web Push](https://webkit.org/blog/12945/meet-web-push/)). A service worker that fails to show a notification for a push can lose the subscription.
- Declarative Web Push (iOS/iPadOS 18.4, macOS 15.5 beta) lets a push display without service-worker JS and removes that penalty ([WebKit, Meet Declarative Web Push](https://webkit.org/blog/16535/meet-declarative-web-push/)) — useful robustness, not a priority change.
- OneSignal's own docs (secondary, vendor) restate that "A tab in Safari, Chrome, Edge, or Firefox cannot request permission" on iOS and raise subscriptions disappearing after clearing Safari data ([OneSignal iOS web push](https://documentation.onesignal.com/docs/en/web-push-for-ios)). Implication: a Student who uses KSUX in a Safari tab, never installs it, or clears data, is unreachable.

**Fan-out cost on Convex Free / Vercel Hobby (KSUX arithmetic, not vendor-verified; quota figures from [Convex limits](https://docs.convex.dev/production/state/limits)):**

| Convex Free limit (primary) | Value | Effect on an N-subscriber blast |
| --- | --- | --- |
| Function calls | 1,000,000/month; "scheduled executions … count" | Batching 200 subs per scheduled Node action → N=40k is ~200 calls/blast. Negligible. |
| Action compute | 20 GB-hours/month; Node runtime 512 MiB | Estimate: 40k POSTs at ~150 ms each, 25-way concurrency inside each action ≈ 240 s total wall-time × 0.5 GB ≈ **0.03 GB-h/blast**. Negligible. *(Latency per POST is an assumption, unmeasured.)* |
| Node action execution time | 10 minutes | A single sequential loop like the current adapter would not finish 40k sends; must chunk via the scheduler. |
| Scheduled functions per mutation | 1,000 | Enough to schedule ≤1,000 batches from one mutation (≥200k subs at 200/batch). |
| Concurrent Node actions (S16) | 64 | Caps parallelism; fine for 200 batches but shares capacity with LibCal/Passio syncs (ADR-0005). |
| Database I/O | **1 GB/month** | The real ceiling. If a `pushSubscriptions` doc + index ≈ 0.5 KB, reading 40k ≈ 20 MB/blast, plus stale-endpoint deletes → roughly **≤40–50 full 40k blasts/month** before contending with the rest of the app. 5k subscribers ≈ 2.5 MB/blast. *(Doc size assumed; measure before relying on it.)* |
| Data egress | 1 GB/month | Outbound push requests from actions — **unverified** whether action-originated HTTP counts here; ~40k × ~1 KB ≈ 40 MB/blast if it does. |

Vercel Hobby is not on the send path (sending runs in Convex actions), so its limits ([Vercel limits](https://vercel.com/docs/limits)) only matter for app load after a blast (a thundering herd opening the PWA). Not quantified here.

**Privacy:** payloads are end-to-end encrypted to the browser per RFC 8291 (Push API §4), but browser vendors' push services (Google FCM for Chrome, Mozilla autopush, Apple APNs) see metadata — timing, size, endpoint (RFC 8030 §8.1–8.2). No new contract or processor is introduced beyond what personal-message push already uses.

### 2. Firebase Cloud Messaging (web)

- **Cost/card:** Spark plan "No payment method needed"; "Cloud Messaging (FCM) No-cost" ([Firebase pricing](https://firebase.google.com/pricing)); product page: "There's no cost to using Cloud Messaging" ([FCM product](https://firebase.google.com/products/cloud-messaging)). Note SPEC already bans *Firebase Storage/Blaze* — FCM on Spark is not that, but it is a new Google project/account dependency.
- **Limits:** default **600k messages/minute** per project; quota-exceeded returns 429 ([FCM throttling and quotas](https://firebase.google.com/docs/cloud-messaging/throttling-and-quotas)). Topics: unlimited subscribers per topic; subscription changes ≤3,000 QPS; ≤1,000 concurrent fan-outs; "Message fanout is not instantaneous"; "A fanout rate of 10,000 QPS for an individual project is not uncommon, but that number is not a guarantee" ([FCM topic messaging](https://firebase.google.com/docs/cloud-messaging/topic-messaging)). Topic subscription management is via the Admin SDK (server credentials) for web clients — moves fan-out off Convex.
- **Web/iOS:** FCM web uses VAPID keys "to authorize send requests to supported web push services" ([FCM web get-started](https://firebase.google.com/docs/cloud-messaging/web/get-started)) — i.e., it is a relay onto the same browser push services. iOS reach is therefore identical to self-hosted VAPID (Home Screen 16.4+ only). FCM-for-Safari specifics were not verified in primary docs: **unverified**.
- **Reliability:** FCM documents that registrations become stale; Android registrations inactive 270 days are expired, and sends to stale registrations "are unlikely to ever be delivered" ([FCM manage tokens](https://firebase.google.com/docs/cloud-messaging/manage-tokens)). No delivery SLA was found.
- **Privacy:** FCM uses Firebase installation IDs; retained "until the Firebase customer makes an API call to delete the ID," then removed within 180 days ([Firebase privacy](https://firebase.google.com/support/privacy)). Adds Google as processor for KSUX subscriber identifiers.

### 3. OneSignal Free

- **Cost:** Free $0/mo; web push "Max 10,000 subscribers per send"; Growth paid at $0.004 per web-push subscriber ([OneSignal pricing](https://onesignal.com/pricing)). A campus-wide send to >10k subscribers would need multiple segmented sends (ToS compliance of that workaround: **unverified**) or a paid plan.
- **Card required for Free:** not stated on the pricing page; **unverified**.
- **iOS:** same Home Screen-only constraint ([OneSignal iOS web push](https://documentation.onesignal.com/docs/en/web-push-for-ios)).
- **Privacy:** Web SDK collects "IP address", "A unique cookie identifier", "Web pages visited that have implemented the SDK … session duration, time-stamp, referring URLs", "Geolocation data inferred from IP address"; states it does not sell personal information ([OneSignal privacy policy](https://onesignal.com/privacy_policy)). This is materially more Student data leaving KSUX than self-hosted VAPID, conflicting with the project's handle-only, no-`.edu`-leak posture ([SPEC](../SPEC.md)).
- **Others** (e.g., Pusher Beams, Novu, Knock, Airship): **not investigated**; out of scope given that any relay still terminates at the same browser push services.

### 4. Critical / time-sensitive semantics: web vs. native

- **Native iOS:** `UNNotificationInterruptionLevel` has `passive`, `active`, `timeSensitive`, `critical` ([Apple](https://developer.apple.com/documentation/usernotifications/unnotificationinterruptionlevel)). Critical alerts "play a sound even when the app is locked, muted, or a person uses Do Not Disturb focus" and require an entitlement requested from Apple ([Apple Critical Alerts entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.usernotifications.critical-alerts)). Native apps are out of scope ([SPEC §1](../SPEC.md)).
- **Web:** `NotificationOptions` offers `tag`, `renotify`, `silent`, `requireInteraction`, `actions`, etc. — no interruption level or priority ([WHATWG Notifications Living Standard](https://notifications.spec.whatwg.org/)). `requireInteraction` is "Limited availability … not Baseline" ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Notification/requireInteraction)). Web-app notifications on iOS follow per-app Notification settings and Focus ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)). Whether iOS treats any web push as Time Sensitive: no primary source found — treat as **no**.
- **Push protocol:** `Urgency: high` only affects push-service forwarding against the UA's requested floor (RFC 8030 §5.3).
- Conclusion: the web has **no way to break through silent/Focus/DND**. Official KSU Alert uses SMS/voice/email/sirens ([campus-safety.md §3](campus-safety.md), citing KSU OEM).

### 5. Fallbacks

| Fallback | Reach | Limit (primary) | Notes |
| --- | --- | --- | --- |
| In-app banner / Tier-0 toast (Convex realtime) | Only Students with an open session | Convex Free 1,000 concurrent sessions ([Convex limits](https://docs.convex.dev/production/state/limits)) | $0, no permission prompt; good for "official KSU bulletin" surface already explored in [alert-ingestion](campus-safety-alert-ingestion.md). Must avoid cached-HTML stale display ([sw.js:75–97](../../public/sw.js#L75-L97)). |
| Gmail SMTP (existing OTP mailer) | Verified `.edu` addresses | Consumer Gmail: >500 recipients in one email or >500 emails/day triggers a 1–24 h block ([Gmail help](https://support.google.com/mail/answer/22839?hl=en)); Workspace is 2,000/day ([Workspace limits](https://support.google.com/a/answer/166852?hl=en)) but not $0 | Not a broadcast channel: 40k recipients = 80 days; would also starve OTP login. KSU timely warnings already go to official KSU email (prior research). |
| SMS | Phones | Twilio US long code/toll-free outbound $0.0083/msg plus number and carrier-registration costs ([Twilio](https://www.twilio.com/en-us/sms/pricing/us)) | Violates $0. KSU Alert already does SMS; KSUX should point Students to keep their Rave contact info current ([campus-safety.md](campus-safety.md)). Email-to-SMS carrier gateways: **not investigated/unverified**. |

## "Done when": comparison table

| Option | Cost | Card required | Fan-out limit | iOS support | Privacy |
| --- | --- | --- | --- | --- | --- |
| Self-hosted VAPID (`web-push` in Convex) | $0 (consumes Convex Free quotas) | No | No vendor cap; bounded by Convex Free **1 GB/mo DB I/O**, 10-min Node actions, 64 concurrent Node actions; push services MAY 429 (RFC 8030 §8.4) | Home Screen web app, iOS/iPadOS 16.4+, user-gesture permission, Focus applies | Encrypted payload; browser push service sees metadata; no new processor |
| Firebase Cloud Messaging (Spark) | $0 ("No-cost") | No ("No payment method needed") | 600k msgs/min default; topics unlimited subs; fan-out ~10k QPS typical, not guaranteed | Same as VAPID (relays to browser push services) | Google processes Firebase installation IDs; retained until deleted (+≤180 days) |
| OneSignal Free | $0 | **Unverified** | **10,000 subscribers per send** | Same Home Screen constraint | SDK collects IP, cookie ID, pages visited, IP-inferred geolocation |
| In-app banner | $0 | No | Convex 1,000 concurrent sessions | Any browser, only while open | Stays in KSUX |
| Gmail SMTP | $0 | No | 500/day consumer cap, shared with OTP | Any mail client | Recipient emails via Google |
| SMS (e.g., Twilio) | ~$0.0083/msg + fees | Yes (paid) | Paid | Native SMS | Phone numbers to vendor — excluded by $0 |

### "Cannot be a reliable emergency channel" caveats (source-supported)

- Acceptance ≠ delivery: a `201` "does not indicate that the message was delivered" ([RFC 8030 §5](https://www.rfc-editor.org/rfc/rfc8030)).
- Messages expire after TTL and may be retained for less than requested; offline devices miss them ([RFC 8030 §5.2, §7.2](https://www.rfc-editor.org/rfc/rfc8030)).
- Subscriptions can be expired by the push service "at any time" ([RFC 8030 §7.3](https://www.rfc-editor.org/rfc/rfc8030)) or revoked by Safari for `userVisibleOnly` violations ([WebKit](https://webkit.org/blog/12945/meet-web-push/)).
- Push "usually ha[s] higher latency than direct communications" and is subject to quantity limits ([W3C Push API §1](https://www.w3.org/TR/push-api/)).
- Outages are indistinguishable from intentional non-delivery ([RFC 8030 §8.4](https://www.rfc-editor.org/rfc/rfc8030)).
- FCM fan-out "is not instantaneous" and rates are "not a guarantee" ([FCM topics](https://firebase.google.com/docs/cloud-messaging/topic-messaging)).
- iOS: reachable only if installed to Home Screen and opted in; Focus can silence it ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)); no web equivalent of critical/time-sensitive alerts ([Apple](https://developer.apple.com/documentation/usernotifications/unnotificationinterruptionlevel), [WHATWG](https://notifications.spec.whatwg.org/)).
- Opt-in only: permission must follow a user gesture; denied/default permission users get nothing.
- Therefore any KSUX Alert push must be labeled supplementary, point to the official KSU source, and never imply KSU Alert enrollment or delivery confirmation (consistent with [campus-safety.md](campus-safety.md) and [campus-safety-handoffs.md](campus-safety-handoffs.md)).

## Open questions / unverified

- Measured per-POST latency to FCM/autopush/APNs from Convex Node actions, and real `pushSubscriptions` document size → validate the DB-I/O and compute estimates.
- Whether Convex "data egress" counts outbound HTTP from actions.
- Per-push-service rate limits for a single VAPID key sending 40k messages in minutes (none published in sources found).
- OneSignal Free credit-card requirement and ToS on splitting sends to bypass the 10k cap.
- FCM web + Safari/iOS behavior specifics in Firebase's primary docs.
- Whether iOS ever elevates web-app notifications to Time Sensitive (no primary source found).
- Governance (not technical): who may trigger a campus-wide Alert, source authority, and reopening Decision #10 / ADR-0005 — owned by map #35, not this ticket.

## Sources

- IETF [RFC 8030 — Generic Event Delivery Using HTTP Push](https://www.rfc-editor.org/rfc/rfc8030) (Standards Track, 2016)
- W3C [Push API, Working Draft 16 Nov 2026](https://www.w3.org/TR/push-api/)
- WHATWG [Notifications API Living Standard](https://notifications.spec.whatwg.org/)
- MDN [Notification.requireInteraction](https://developer.mozilla.org/en-US/docs/Web/API/Notification/requireInteraction)
- WebKit [Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/); [Meet Web Push](https://webkit.org/blog/12945/meet-web-push/); [Meet Declarative Web Push](https://webkit.org/blog/16535/meet-declarative-web-push/)
- Apple [UNNotificationInterruptionLevel](https://developer.apple.com/documentation/usernotifications/unnotificationinterruptionlevel); [Critical Alerts entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.usernotifications.critical-alerts)
- Convex [Limits](https://docs.convex.dev/production/state/limits)
- Vercel [Limits](https://vercel.com/docs/limits)
- Firebase [Pricing](https://firebase.google.com/pricing); [FCM product](https://firebase.google.com/products/cloud-messaging); [Throttling and quotas](https://firebase.google.com/docs/cloud-messaging/throttling-and-quotas); [Topic messaging](https://firebase.google.com/docs/cloud-messaging/topic-messaging); [Web get-started](https://firebase.google.com/docs/cloud-messaging/web/get-started); [Manage tokens](https://firebase.google.com/docs/cloud-messaging/manage-tokens); [Privacy](https://firebase.google.com/support/privacy)
- OneSignal [Pricing](https://onesignal.com/pricing); [Privacy policy](https://onesignal.com/privacy_policy); [iOS web push docs](https://documentation.onesignal.com/docs/en/web-push-for-ios)
- Google [Gmail sending limits](https://support.google.com/mail/answer/22839?hl=en); [Workspace Gmail sending limits](https://support.google.com/a/answer/166852?hl=en)
- Twilio [US SMS pricing](https://www.twilio.com/en-us/sms/pricing/us)
- Repo: [SPEC](../SPEC.md), [ADR-0005](../adr/0005-diff-gated-sync-read-time-expiry-and-read-only-commuter-pwa.md), [pushAdapter.ts](../../convex/lib/pushAdapter.ts), prior [campus-safety research](campus-safety.md)

All pages retrieved 2026-11-17.
