# OwlSide production setup wizard

From the repository root, in your own interactive terminal:

```bash
./scripts/setup-env.sh
```

Do not run through an agent, redirect its input, record your terminal, or enable
Bash verbose/tracing (`-v`, `-x`). Never paste credentials into chat.

## Prerequisites

- Node.js 22+, pnpm, Git, dependencies installed with `pnpm install`.
- Vercel CLI available and authenticated using `vercel login`.
- This directory linked to the intended existing project with `vercel link`.
  The wizard reads `.vercel/project.json`, verifies its project/team through the
  authenticated API, and asks you to confirm the Git connection.
- Service accounts and authorization to change production configuration.
  Stay on free plans; the script does not enroll in paid plans or buy domains.
  Providers' free-tier eligibility and quotas can change.

## What it does

Twelve stages cover account/target checks, Convex, UploadThing, Gmail,
Groq privacy controls, optional Gemini, optional Cloudflare, optional Web Push,
moderator access, environment application, deployment, and seed/live checks.

Credentials are captured using hidden input. A private, Git-ignored,
mode-0600 `.env.production-setup` file remembers entered values. This is a
plaintext credential file, **not an encrypted vault**. Keep it protected or remove
it yourself after securely storing the necessary credentials. Never commit it.
The wizard rejects symlinks and tracked state files. It does not source the file,
print secrets, or pass credentials as CLI arguments.

Your development `.env.local` is not changed. No GitHub secrets are created;
this project has no GitHub Actions workflows requiring them. The upstream
wizard library remains unchanged; OwlSide-specific helpers are below its STAGES
marker.

### Destination map

| Values | Vercel Production | Convex production |
| --- | --- | --- |
| `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL` | Yes | No |
| `CONVEX_DEPLOY_KEY` (secret) | Yes | Used in the local CLI environment, not saved as a backend variable |
| `OWLSIDE_SERVER_SECRET` (secret; same value in both services) | Yes | Yes |
| `UPLOADTHING_TOKEN` (secret) | Yes | Yes |
| Gmail sender(s), app password(s) (secret passwords) | No | Yes |
| `GROQ_API_KEY`, optional `GEMINI_API_KEY` (secret) | No | Yes |
| Optional Cloudflare account ID / API token (secret token) | No | Yes |
| Optional `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Yes | Yes |
| Optional `VAPID_PRIVATE_KEY` (secret), `VAPID_SUBJECT` | No | Yes |
| `OWLSIDE_ALLOW_DEV_OTP_LOG=false`, `OWLSIDE_MAINTAINER_EMAILS` | No | Yes |

Values are also retained in the local private state file for reruns. Moderator
emails must preserve the actual `@students.kennesaw.edu` or `@kennesaw.edu`
domain, lowercase the local part, and omit plus aliases.

### Email sign-in returns 503

Next.js requires `OWLSIDE_SERVER_SECRET` in Vercel **Production** before it can
validate a code or contact Convex for sign-in. Convex must have the identical
private value. After the rebrand, an old `KSUX_SERVER_SECRET` setting alone does
not satisfy this requirement. Reuse the existing production secret under the new
name in both services, then redeploy Vercel so its server receives the setting.
The setup wizard now captures and applies this shared secret to both targets.

If the credential is present but sign-in still fails, check the Vercel runtime
logs and the matching Convex production deployment. Actual email delivery also
requires `GMAIL_SMTP_USER` and `GMAIL_SMTP_APP_PASSWORD` in Convex. A developer
console OTP is not an email delivery mechanism for production.

### Production safeguards

- A production Convex deploy key is required; dev/preview/project keys are
  rejected. Both deployment URLs must match the deployment named by that key.
- Environment writes require confirmation. Existing matching values are
  replaced; application is sequential, **not transactional**. A failed write
  stops the script. Earlier successful writes remain; rerun to finish.
- CLI errors during credential writes are suppressed to avoid accidental secret
  output. Check CLI login, target, permissions, and provider dashboards if a
  named variable fails to apply. Do not enable debug logs containing secrets.
- Selecting No for an optional service preserves existing remote settings. It
  does **not** disable a service previously configured. Remove existing remote
  settings manually if you want to disable it.
- VAPID reruns preserve the saved pair. For an existing installation, import its
  pair rather than generating a replacement: rotation can invalidate existing
  subscriptions.
- The wizard asks you to set the build command in the Vercel dashboard:
  `npx convex deploy --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL --cmd 'pnpm build'`.
- Deploy the reviewed **main branch** through Vercel's dashboard. The wizard
  intentionally does not deploy your local working tree, push commits, or change
  your Git connection. It asks you to verify Ready and successful Convex build
  logs before seeding.
- Do not expose production credentials to Preview/Development builds or
  untrusted pull requests. Configure a separate Convex preview key/backend
  before deploying previews.
- Production seed execution has a separate confirmation. Take a backup before
  seeding an existing populated deployment. Only `seed:bootstrapKsu` is run.
  `seed:backfillEmbeddings` is currently a stub returning `embeddedCount: 0`,
  so the wizard does not claim to backfill embeddings.
- Live smoke verification remains manual: demo, two-tab interaction, Scrappy,
  real email OTP/login, upload, moderator access, and optional push delivery.
  A finished wizard is not evidence that every feature is production-ready.

## Validation without touching production

```bash
bash -n scripts/setup-production.sh
node scripts/test-setup-production.mjs
# Optional, if installed:
shellcheck scripts/setup-production.sh
```

The tests load function definitions without calling the wizard. Remote calls
are stubbed; only temporary test files with fake values are used. Tests check
upserts, permissions, hidden capture/defaults, unsafe literal rejection,
optional choices, scoped stdin-based writes, failure handling, and stage count.
No end-to-end provisioning or deployment is performed by these tests.

## Sources for manual dashboard steps

- [Matt Pocock wizard skill and template](https://github.com/mattpocock/skills/tree/main/skills/engineering/wizard)
- [Convex + Vercel production setup](https://docs.convex.dev/production/hosting/vercel)
- [UploadThing Next.js environment setup](https://docs.uploadthing.com/getting-started/appdir)
- [Google app passwords](https://support.google.com/accounts/answer/185833)
- [Groq data controls and Zero Data Retention](https://console.groq.com/docs/your-data)
- [Cloudflare Workers AI REST token/account setup](https://developers.cloudflare.com/workers-ai/get-started/rest-api/)
- [OwlSide operations runbook](../docs/RUNBOOK.md)

This is the repeatable team onboarding path, linked from the repository README.
`setup-env.sh` is a small stable entry point for the maintained 12-stage
`setup-production.sh` wizard. Run it on your own terminal, not in this chat.
For local development, follow the runbook separately: this wizard deliberately
never installs production credentials into a teammate's development deployment.
