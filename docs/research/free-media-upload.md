# $0-compatible media upload for incident photos and short video

- **Date:** 2026-11-17
- **Ticket:** [Control707/KSUX#43](https://github.com/Control707/KSUX/issues/43) (part of map [#35](https://github.com/Control707/KSUX/issues/35))
- **Branch:** `research/free-media-upload` (research only; never merged)
- **Scope:** storage and processing options for incident photos and short video under the [$0 / no-credit-card rule](../SPEC.md#L10-L13). This is not a product decision. Whether KSUX should accept incident media at all is a separate question; see [campus-safety.md](./campus-safety.md), which recommended that the MVP collect **no** incident photos or narratives.

## Question

What $0-compatible media upload options fit incident reports (photos, possibly short video) on top of today's UploadThing Free setup (2 GB, still images only, client-side WebP re-encode, EXIF/GPS strip)? Specifically:

- Can short video fit at all?
- What client-side processing is feasible (metadata strip, transcoding, face/plate blur)?
- How fast would incident media use up 2 GB?
- What moderation is available on free tiers?

## Executive answer

1. **Photos only: keep the current pipeline unchanged.** UploadThing Free (2 GB, unlimited egress, no card) plus the existing proxied, server-re-encoded WebP route already handles incident photos. At the 1 MB hard cap, 2 GB holds roughly 2,000 photos in the worst case. With realistic sizes (unverified estimate: 200–400 KB each), it holds roughly 5,000–10,000. A 30–90-day retention purge for incident media keeps this from filling up.
2. **Short clips are technically possible at $0, but not through the current route.** Three changes are needed:
   - **Direct upload instead of proxy:** UploadThing supports `video` file routes (default max 16 MB, configurable), and Free does not restrict file types. However, the [current route](../../src/app/api/uploadthing/route.ts) proxies bytes through a Vercel Function, which has a [hard 4.5 MB request-body limit](https://vercel.com/docs/functions/limitations). Clips must use UploadThing's presigned **client-side upload**, which bypasses the function.
   - **Client-side metadata strip and re-encode:** with direct upload, the server can no longer re-encode files with `sharp`. Stripping metadata and re-encoding must happen in the browser.
   - **Tight caps:** at most 15 s, 720p, about 1.5 Mbps (about 3 MB per clip).
3. **Preferred clip pipeline:** use [Mediabunny](https://mediabunny.dev/guide/introduction) (WebCodecs, hardware-accelerated) to re-encode and remove all metadata tags. It is a better fit than ffmpeg.wasm, which is [~12–25× slower than native FFmpeg](https://ffmpegwasm.netlify.app/docs/performance), and has a large WASM core. **Firefox for Android has no WebCodecs**, so clip upload must be optional with a "photo only" fallback.
4. **Automated face/plate blurring is not reliable enough to promise.** Face *detection* is free in the browser through MediaPipe BlazeFace. There is no first-party free license-plate detector. A **manual "tap to blur" tool for photos** is the realistic $0 option, and video blurring should be out of scope.
5. **No free moderation service fits.** No free-tier service gives NSFW/violence classification for user media without a card or without training use of the data:
   - Cloudinary's Rekognition moderation is a separate add-on.
   - Groq deprecated its image-capable Llama Guard 4 in favor of text-only `gpt-oss-safeguard-20b`.
   - Gemini's unpaid tier uses submitted content to improve Google products.

   Incident media needs **human pre-publication review**, or posting as `under_review` by default. In-browser [NSFWJS](https://github.com/infinitered/nsfwjs) can be used only as a soft pre-check for sexual content. It does not detect violence.

**Ruled out** (card, prepaid, or quota traps): Cloudflare R2, Cloudflare Stream, Vercel Blob Hobby, Convex file storage for video, and Cloudinary Free as primary video store. Details are in the comparison table below.

## Current KSUX baseline (repository evidence)

- Upload path: [`src/app/api/uploadthing/route.ts`](../../src/app/api/uploadthing/route.ts)
  - Accepts only `image/webp`, at most 1 MB, at most 1440 px, single frame.
  - Re-encodes server-side with `sharp` (`.webp({ quality: 82 })`) before calling `UTApi.uploadFiles`.
  - The server re-encode is the real metadata guarantee. It is a server **proxy**, so every byte passes through a Vercel Function.
- Cleanup: [`convex/storageNode.ts`](../../convex/storageNode.ts) uses `UTApi.deleteFiles`, called by the hourly `:42` purge ([SPEC §5.3](../SPEC.md#L101-L103)).
- Spec caps: [SPEC §2](../SPEC.md#L30)
  - "Still images only."
  - 4 images per `Post`/`Listing`, 1 per chat message, 20 uploads per `demoSessionId`.
- Safety framing: prior research says KSUX is not a police intake. LiveSafe already supports text, photo, and video tips to KSU officials ([campus-safety.md](./campus-safety.md), [campus-safety-handoffs.md](./campus-safety-handoffs.md)). KSU's ASFR also warns that uploaded media is not legally confidential ([campus-safety.md](./campus-safety.md)). Any incident media in KSUX would be community `Feed` content, not a police report.

## Findings

### 1. Storage providers: can video fit at $0?

**UploadThing Free ("2GB App"):**
- $0/month, "2GB of storage", "Unlimited uploads and downloads". Storage is *shared between all apps* on the account ([pricing](https://uploadthing.com/pricing)).
- The pricing page lists no file-type restriction by plan.
- File routes accept `image`, `video`, `audio`, and others. The default `video` max size is **16 MB**, and `maxFileSize` is configurable (the docs example uses `"256MB"`) ([File Routes](https://docs.uploadthing.com/file-routes)).
- UploadThing recommends **client-side uploads with server-issued presigned URLs**, so file bytes never pass through your server ([Uploading Files](https://docs.uploadthing.com/uploading-files)).
- So "still images only" is a **KSUX policy**, not an UploadThing Free limit.

**Vercel Function body limit:**
- "The maximum payload size for the request body … of a Vercel Function is **4.5 MB**" ([Functions limits](https://vercel.com/docs/functions/limitations)).
- The current proxy design therefore cannot carry clips over about 4.4 MB.
- Video requires UploadThing's direct client upload, which also avoids spending the Hobby Fast Data Transfer allowance.

**Convex File Storage (Free):**
- 1 GB storage total and **1 GB/month egress** ([limits](https://docs.convex.dev/production/state/limits), [pricing](https://convex.dev/pricing)).
- No file-size limit, but the upload POST has a 2-minute timeout ([Uploading files](https://docs.convex.dev/file-storage/upload-files)).
- A 1 GB/month egress cap means about 330 views of a 3 MB clip per month in total. It is unsuitable for public media. It also counts against the same Free deployment that runs the app.

**Vercel Blob (Hobby):**
- 1 GB/month storage, 10,000 simple operations, 2,000 advanced operations, 10 GB data transfer.
- Hobby usage is free with no overage billing, but "you will not be able to access Vercel Blob if limits are exceeded", and you must wait **30 days** ([Blob pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing)).
- That is a hard outage mode, and the allowance is shared with all Vercel services on the project.

**Cloudinary Free:**
- $0, "No credit card required", 25 monthly credits ([pricing](https://cloudinary.com/pricing)).
- 1 credit = 1 GB storage **or** 1 GB image bandwidth **or** 1,000 transformations. The "2GB video bandwidth boosted 2:1" rate is "PAID PLANS ONLY" (same page).
- Free max video file size is **100 MB**; max image size is 10 MB ([compare plans](https://cloudinary.com/pricing/compare-plans)).
- It does server-side transcoding and adaptive streaming, which no other free option gives.
- The catch: storage, delivery, and transcodes share one 25-credit pool. Video playback quickly spends that pool.
- It would add a new third-party processor of student incident media, which is a privacy review item.

**Cloudflare R2:** the free tier is 10 GB-month, but getting started requires "an R2 subscription … Complete the checkout flow" ([R2 get started](https://developers.cloudflare.com/r2/get-started/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/)). That checkout is card-gated, and the SPEC already excludes R2 ([SPEC §1](../SPEC.md#L11)).

**Cloudflare Stream:** ingress and encoding are free, but storage is "a **prepaid** pricing dimension purchased in increments of $5 per month for each 1,000 minutes", and delivery is $1 per 1,000 minutes ([Stream pricing](https://developers.cloudflare.com/stream/pricing/)). There is no $0 tier, so it is excluded.

### 2. Client-side processing in the browser

**Video metadata matters.** Phone videos carry location in QuickTime/MP4 metadata, such as `location.ISO6709` and `©xyz` GPSCoordinates ([ExifTool QuickTime tags](https://exiftool.org/TagNames/QuickTime.html)). Uploading the original file leaks where the clip was recorded. The current image route only avoids this because `sharp` re-encodes images on the server.

**Mediabunny (WebCodecs):**
- A zero-dependency, tree-shakable TypeScript library for reading, writing, and converting MP4/WebM in the browser, with hardware-accelerated encode/decode via WebCodecs ([intro](https://mediabunny.dev/guide/introduction)).
- `Conversion` supports resize, crop, trim, bitrate/quality, and frame-rate settings.
- Descriptive metadata tags are copied by default, but `tags: {}` "remove[s] all metadata" ([Converting media files](https://mediabunny.dev/guide/converting-media-files)).
- It also has a per-frame `process` hook, which would be the place for a blur pass.
- **Unverified:** whether every non-descriptive box (for example, Apple `udta`/`meta` vendor atoms) is dropped. Validate with ExifTool on real iPhone/Android clips before shipping.

**WebCodecs browser support** ([MDN browser-compat-data](https://github.com/mdn/browser-compat-data), v8.1.9, fetched 2026-11-17):

| API | Chrome | Chrome Android | Safari / iOS | Firefox | Firefox Android |
|---|---|---|---|---|---|
| `VideoEncoder` | 94 | 94 | 16.4 | 130 | No |

Firefox for Android has no support, so clip upload must degrade to "photos only" there.

**ffmpeg.wasm:**
- Runs FFmpeg in a Web Worker; offers single- and multi-thread cores ([overview](https://ffmpegwasm.netlify.app/docs/overview)).
- In the maintainers' own benchmark, a webm→mp4 transcode took 5.2 s native, **128.8 s** single-thread (0.04×), and **60.4 s** multi-thread (0.08×) ([performance](https://ffmpegwasm.netlify.app/docs/performance)).
- The multi-thread core needs `SharedArrayBuffer`, which requires cross-origin isolation headers. Those headers can break third-party embeds such as OpenFreeMap tiles and UploadThing (unverified for this app).
- The single-thread core is far too slow for phone-side transcoding of incident clips, and the WASM core download is large (unverified size).
- Use only as a fallback, if at all.

**Face detection:**
- MediaPipe Face Detector (BlazeFace short-range) runs in the browser on WASM/GPU.
- It has `IMAGE` and `VIDEO` running modes with bounding boxes ([Face Detector web guide](https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector/web_js)).
- The page reports about 2.94 ms per frame on CPU on a Pixel 6.
- Short-range is tuned for faces near the camera. Bystanders in incident photos are often far away, so expect missed detections.
- Treat automatic blur as an assist, never a guarantee.

**License plates:** I found no first-party, free, browser-ready plate detector (unverified absence). The realistic $0 option is a **manual blur/redact tool** for photos: tap or drag to blur rectangles on the canvas before re-encoding. Detection on video multiplies cost by the number of frames and leaks on any single missed frame, so video redaction should be out of scope.

### 3. Storage math (2 GB UploadThing, shared with existing Post/Listing/chat/avatar images)

Assumptions: sizes for photos are bounded by the current 1 MB cap. Clip sizes are computed from bitrate (bytes = Mbps × s / 8). Real WebP averages are an **unverified estimate**.

| Media | Per-item size | Items per 2 GB |
|---|---|---|
| Photo, worst case (1 MB cap) | 1.0 MB | ~2,000 |
| Photo, typical 1440 px WebP q≈0.8 (estimate) | 0.2–0.4 MB | ~5,000–10,000 |
| Clip, 15 s, 480p, ~0.8 Mbps video + 64 kbps audio | ~1.6 MB | ~1,250 |
| Clip, 15 s, 720p, ~1.5 Mbps + 64 kbps audio | ~2.9 MB | ~690 |
| Clip, 30 s, 720p, ~2.5 Mbps (unconstrained phone-ish) | ~9.6 MB | ~210 |
| Raw phone clip, 15 s 1080p HEVC (~10 Mbps, estimate) | ~19 MB | ~105 |

**Example: 10 incident reports per day with 2 photos plus 1 capped 720p/15 s clip each.**
- Daily: about 10 × (2 × 0.3 + 2.9) ≈ 35 MB.
- That is about **1 GB per month**, so the full 2 GB is gone in about 2 months without a purge.
- Photos only: about 6 MB/day, roughly 11 months.

**Retention and purge strategies:**
- Reuse the existing `mediaAssets` + `:42` cursor-batched `UTApi.deleteFiles` purge ([SPEC §5.3](../SPEC.md#L101-L103)).
- Add an incident-media TTL (for example, 30 days for clips, 90 days for photos). Incident content is time-sensitive, so a TTL fits.
- Delete media immediately on `[Deleted Post]`, quarantine expiry, or account deletion. This already exists for account deletion ([SPEC §4.5](../SPEC.md#L73)).
- Keep a hard per-`Student` daily media budget, such as 1 clip per day and 10 MB per day.
- Add a **global soft ceiling**, for example refusing clips above 1.5 GB used. UploadThing's `UTApi` exposes usage info ([UTApi](https://docs.uploadthing.com/api-reference/ut-api); exact fields unverified), so a cron can switch off clip upload before images break.
- Keep video off for `Judge Demo Mode` sessions, or limit it to 1 clip with a 24-hour purge, so demo traffic cannot fill the shared 2 GB.

### 4. Moderation for media on free tiers

**Cloudinary:** "Amazon Rekognition AI Moderation" exists, but it is a **separately registered add-on** ([docs](https://cloudinary.com/documentation/aws_rekognition_ai_moderation_addon)). Whether the add-on has a free allotment on the Free plan is unverified. It would only cover media stored in Cloudinary.

**Groq:**
- The image-capable `meta-llama/llama-guard-4-12b` was **deprecated** (announced Feb 10, 2026; shutdown Mar 5, 2026) in favor of `openai/gpt-oss-safeguard-20b` ([deprecations](https://console.groq.com/docs/deprecations)).
- That model's input is **Text** only ([model page](https://console.groq.com/docs/model/openai/gpt-oss-safeguard-20b)).
- Groq can moderate captions or `Post` text, but not images.

**Cloudflare Workers AI:**
- Free allocation is 10,000 Neurons/day; going beyond that requires Workers Paid ([pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)).
- Vision models (for example `llama-3.2-11b-vision-instruct`) could be prompted as a classifier, but that is not a dedicated moderation model. `llama-guard-3-8b` is text ([model catalog](https://developers.cloudflare.com/workers-ai/models/)).
- KSUX already spends this allowance on Scrappy Tier 3 and embeddings ([SPEC §2](../SPEC.md#L32-L33)).
- Not recommended.

**Gemini free tier:** on unpaid quota, "Google uses the content you submit … to provide, improve, and develop Google products" ([Gemini API terms](https://ai.google.dev/gemini-api/terms)). That is a poor fit for incident photos of bystanders.

**NSFWJS (in-browser):** TensorFlow.js classifier with classes Drawing/Hentai/Neutral/Porn/Sexy, and a model of about 2.6–3.5 MB ([repo](https://github.com/infinitered/nsfwjs)).
- No violence/gore class.
- It runs on the uploader's device, so a malicious uploader can bypass it.
- Use only as a soft UX nudge ("This image may violate…").

**Recommendation:** incident media should be **held for moderator approval** (`visibilityStatus: "under_review"`) or shown only behind a tap-to-reveal, plus the existing 1-tap `Report` and 3-reporter quarantine ([SPEC §4.5](../SPEC.md#L69-L74)). A human `Moderation Queue` is the only $0 control that covers violence and identifiable bystanders.

## Comparison table

| Option | $0 without card? | Video allowed | Size / quota (free) | Egress | Server-side transcode | Moderation | Verdict |
|---|---|---|---|---|---|---|---|
| **UploadThing Free** (current) | Yes | Yes (`video` route, default 16 MB) | 2 GB shared across apps | Unlimited | No | None | **Use for photos and capped clips**; needs direct client upload for clips |
| Convex File Storage (Free) | Yes | Yes | 1 GB | **1 GB/month** | No | None | Not for public media |
| Vercel Blob (Hobby) | Yes | Yes | 1 GB, 10 GB transfer; **locked 30 days** if exceeded | 10 GB/month | No | None | Not recommended (outage mode) |
| Cloudinary Free | Yes (no card) | Yes, ≤100 MB | 25 credits pooled across storage, bandwidth, and transforms | Counts against credits; no free video boost | **Yes** (transcode, ABR) | Rekognition add-on (separate) | Optional overflow for clips only; adds a third-party processor |
| Cloudflare Stream | **No** (prepaid $5/1,000 min) | Yes | Prepaid | $1/1,000 min | Yes | None | Excluded |
| Cloudflare R2 | **No** (subscription checkout) | Yes | 10 GB-month | Free | No | None | Excluded (also excluded by SPEC) |
| Through Vercel Function proxy (current route) | Yes | **No**; 4.5 MB request cap | n/a | Uses Hobby transfer | `sharp` (images only) | n/a | Keep for images; not for video |

| Client processing | Speed | Coverage | Strips metadata | Verdict |
|---|---|---|---|---|
| Canvas → WebP (current) + server `sharp` | Fast | All browsers | Yes (re-encode) | Keep for photos |
| Mediabunny (WebCodecs) | Hardware-accelerated | No Firefox Android | `tags: {}` removes descriptive tags (verify atoms) | **Use for clips** |
| ffmpeg.wasm | 0.04–0.08× native | Broad; MT needs cross-origin isolation | Yes (`-map_metadata -1`) | Fallback only |
| MediaPipe face detector | ~3 ms/frame (Pixel 6, CPU) | Browser WASM/GPU | n/a | Assist only, never a promise |
| Manual blur tool (canvas) | Instant | All | n/a | **Recommended for photos** |

## Recommendation per scenario ("Done when")

### Scenario A: photos only (recommended for the MVP)

- **Storage:** reuse UploadThing Free and the existing proxied `sharp` route. No new vendor.
- **Caps:** keep 4 photos per `Post`, at most 1 MB each.
- **Retention:** add an incident-media TTL (about 90 days) to the `:42` purge.
- **Client:** add a manual tap-to-blur redaction step before the WebP re-encode. Optionally add a MediaPipe auto-suggest for faces, labeled "check before posting".
- **Moderation:** incident-tagged media defaults to tap-to-reveal or moderator review; caption text is screened with the existing guardrails. Optionally run NSFWJS as a client-side nudge.
- **Budget:** at 10 photo reports per day, about 1 year of headroom. With a 90-day TTL, the steady state is about 0.5 GB or less.

### Scenario B: photos plus short clips

- **Storage:** UploadThing Free through a **new direct-to-UploadThing client upload route** (`video: { maxFileSize: "8MB", maxFileCount: 1 }`). The presigned upload bypasses the Vercel 4.5 MB limit and Hobby transfer.
- **Validation:** the server only reserves quota in Convex (middleware). It verifies in `onUploadComplete`: MIME, size, and ideally duration from a range-read of the `moov` box (unverified feasibility). Any file that fails is deleted.
- **Client:** Mediabunny `Conversion` to H.264/AAC MP4:
  - ≤15 s trim, ≤720p, ~1.5 Mbps, `tags: {}`.
  - Block upload if WebCodecs is missing (Firefox Android); offer photo instead.
  - **Never upload the original file.**
- **Privacy:** no automatic blur promise for video. Show a pre-post warning ("faces and plates are visible; KSUX can't blur video"), or allow audio removal.
- **Caps:** 1 clip per incident `Post`, 1 clip per `Student` per day, 30-day TTL, global kill switch at about 1.5 GB used, and no clips in `Judge Demo Mode` (or a 24-hour purge).
- **Moderation:** clips always enter moderator review before public display. No free automated video moderation exists.
- **Overflow (optional):** Cloudinary Free as a clip-only store if UploadThing nears its limit. It adds server transcoding but uses the same 25 shared credits and adds a vendor; needs privacy review.
- **Budget:** at 10 reports per day with 1 clip and 2 photos, about 1 GB/month. A 30-day clip TTL keeps the steady state at about 1 GB. That is tight alongside existing images, so the kill switch is mandatory.

## Open questions / unverified

1. Product: should KSUX accept incident media at all, given that LiveSafe already accepts photo/video tips for KSU officials and prior research recommended no incident collection ([campus-safety.md](./campus-safety.md))? This doc only answers *how*, if yes.
2. Whether Mediabunny with `tags: {}` drops every location-bearing atom (Apple `mebx` timed metadata tracks, Android `©xyz`). **Must verify** with ExifTool on real iOS/Android captures.
3. Real average WebP size for KSUX photos. The 0.2–0.4 MB figure is an estimate; measure from `mediaAssets.byteSize`.
4. UploadThing Free terms on video/abuse and the exact `getUsageInfo` fields. Not read in detail.
5. Whether Cloudinary's Rekognition add-on has any free allotment on the Free plan.
6. Whether cross-origin isolation (needed for multi-thread ffmpeg.wasm) breaks UploadThing, OpenFreeMap, or Passio embeds.
7. Who staffs moderator review latency for incident media (same open question as [campus-safety-community-feed.md](./campus-safety-community-feed.md)).

## Sources

- UploadThing: [Pricing](https://uploadthing.com/pricing) · [File Routes](https://docs.uploadthing.com/file-routes) · [Uploading Files](https://docs.uploadthing.com/uploading-files) · [UTApi](https://docs.uploadthing.com/api-reference/ut-api)
- Vercel: [Functions limits (4.5 MB body)](https://vercel.com/docs/functions/limitations) · [Blob pricing and Hobby limits](https://vercel.com/docs/vercel-blob/usage-and-pricing)
- Convex: [Limits](https://docs.convex.dev/production/state/limits) · [Pricing](https://convex.dev/pricing) · [Uploading files](https://docs.convex.dev/file-storage/upload-files)
- Cloudinary: [Pricing / credits](https://cloudinary.com/pricing) · [Compare plans (file-size limits)](https://cloudinary.com/pricing/compare-plans) · [Rekognition AI Moderation add-on](https://cloudinary.com/documentation/aws_rekognition_ai_moderation_addon)
- Cloudflare: [Stream pricing](https://developers.cloudflare.com/stream/pricing/) · [R2 pricing](https://developers.cloudflare.com/r2/pricing/) · [R2 get started](https://developers.cloudflare.com/r2/get-started/) · [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) · [Workers AI models](https://developers.cloudflare.com/workers-ai/models/)
- Browser processing: [Mediabunny intro](https://mediabunny.dev/guide/introduction) · [Mediabunny conversion](https://mediabunny.dev/guide/converting-media-files) · [ffmpeg.wasm overview](https://ffmpegwasm.netlify.app/docs/overview) · [ffmpeg.wasm performance](https://ffmpegwasm.netlify.app/docs/performance) · [MDN browser-compat-data](https://github.com/mdn/browser-compat-data) · [MediaPipe Face Detector (web)](https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector/web_js) · [ExifTool QuickTime tags](https://exiftool.org/TagNames/QuickTime.html)
- Moderation: [Groq deprecations](https://console.groq.com/docs/deprecations) · [Groq gpt-oss-safeguard-20b](https://console.groq.com/docs/model/openai/gpt-oss-safeguard-20b) · [Gemini API terms](https://ai.google.dev/gemini-api/terms) · [NSFWJS](https://github.com/infinitered/nsfwjs)
- Repository: [SPEC.md](../SPEC.md) · [upload route](../../src/app/api/uploadthing/route.ts) · [storageNode.ts](../../convex/storageNode.ts) · prior research [campus-safety.md](./campus-safety.md), [campus-safety-handoffs.md](./campus-safety-handoffs.md), [campus-safety-community-feed.md](./campus-safety-community-feed.md) (untracked on `main`; may not resolve on this branch)
