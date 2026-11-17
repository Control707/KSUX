## Parent

[Spec: KSUX — Unified Kennesaw State Campus Social Network & Daily-Life Companion PWA](https://github.com/Control707/KSUX/issues/13)

## What to do

A designated human production owner must provision credentials, configure the intended Vercel and Convex production targets, deploy the reviewed main branch, seed institutional catalogs, and record live verification. Closed implementation tickets are not evidence of a working cloud deployment.

Use the repeatable `./scripts/setup-env.sh` wizard in your own interactive terminal, following `scripts/setup-production.md`. Never paste tokens, app passwords, private VAPID keys, OTPs, or credential-bearing screenshots into this issue, pull requests, or chat. Keep local secret files ignored by Git and restricted to mode 0600. Teammates use separate development deployments, not production credentials.

## Why ready-for-human

Requires account ownership, dashboard authorization, credential creation, production-target confirmation, real KSU inbox delivery, and browser/device checks. Agents can prepare/test the setup tooling but cannot attest to these human/live checks from mocked tests.

## Acceptance criteria

- [ ] Name a production owner and backup contact; confirm access to Control707/KSUX and the exact Vercel project/team and Convex production deployment. Do not change an unrelated project.
- [ ] Confirm current free-plan eligibility, quotas, and model availability in provider dashboards. Do not enroll in paid services without separate approval. Record any provider/model mismatch as a blocker rather than claiming deployment is complete.
- [ ] Create/configure Convex production deploy key and matching cloud/site URLs; UploadThing SDK token; Gmail sending account with 2FA and app password; Groq key with verified privacy settings; canonical KSU moderator email allowlist.
- [ ] Record explicit enable/defer decisions for optional Gemini, Cloudflare Workers AI, secondary Gmail sender, and VAPID Web Push. Preserve/import an existing VAPID pair instead of accidentally rotating it.
- [ ] Apply backend-only credentials to Convex and frontend/deploy settings to Vercel Production only. UploadThing needs the same token in both. Push needs its public key in both and private key only in Convex. Set KSUX_ALLOW_DEV_OTP_LOG=false. No secrets in NEXT_PUBLIC_* variables.
- [ ] Keep production keys out of Preview/Development and untrusted pull requests. Establish separate preview/development backends before enabling previews. Do not create unused GitHub Actions secrets.
- [ ] Set the Convex-before-Next build command, verify the main-branch Git connection, and deploy the reviewed main branch through Vercel. Record the public deployment URL, commit SHA, Ready state, and successful Convex build evidence (no secret values).
- [ ] Back up an existing populated production database before the separately confirmed seed:bootstrapKsu run. Verify catalog provenance and freshness: seeded/synthetic data is not proof that upstream ingestion is live. The current seed:backfillEmbeddings implementation is a stub; do not claim vector backfill ran.
- [ ] Run typecheck/lint/tests/build as applicable and verify production: welcome/demo, independent two-tab personas and realtime messages/handoff, real KSU OTP delivery/login, image upload/cleanup, moderator authorization, Feed and Scrappy, both Campuses and daily-life source timestamps, install/offline map/schedule, and optional push if enabled.
- [ ] Post non-secret release evidence and any deferred capabilities here. If a required live path fails, leave the issue open and file a linked corrective ticket. Securely retain required credentials in the team's approved store and remove the local plaintext setup state when no longer needed.

## Dependencies and completion

Provisioning can start now. The code slices from the parent spec have closed, but target configuration, reviewed build success, and live checks above gate release. Do not close this ticket merely because the wizard helper tests pass or the hosting build is Ready.
