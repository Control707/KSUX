import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Load only function definitions. Never start the wizard, open a browser,
// invoke a CLI, generate credentials, or write to a remote service.
const source = readFileSync(fileURLToPath(new URL('./setup-production.sh', import.meta.url)), 'utf8');
const launcher = readFileSync(fileURLToPath(new URL('./setup-env.sh', import.meta.url)), 'utf8');
assert.match(launcher, /exec bash "\$ROOT\/scripts\/setup-production\.sh" "\$@"/);
assert.match(launcher, /set \+x/);
assert.match(source, /\[\[ -t 0 && -t 1 \]\]/, 'interactive terminal required');
assert.match(source, /git check-ignore -q \.env\.production-setup/);
assert.match(source, /chmod 600 "\$ENV_FILE"/);
assert.match(source, /\[\[ ! -L "\$ENV_FILE" \]\]/, 'reject symlink secret state');
const entry = '\nrun_wizard "$@"; exit';
assert.equal(source.split(entry).length, 2, 'single wizard entry point');
const definitions = source.slice(0, source.lastIndexOf(entry));
const stages = [...source.matchAll(/^stage "/gm)].length;
assert.equal(stages, 12);
assert.match(source, /TOTAL_STAGES=12/);
assert.doesNotMatch(source.slice(source.indexOf('# KSUX-specific helpers')), /\bset_secret\s/);

const directory = mkdtempSync(join(tmpdir(), 'ksux-wizard-test-'));
// Verify the absolute cleanup target belongs to this test before deleting it.
assert.equal(resolve(directory), directory);
assert.ok(directory.startsWith(join(tmpdir(), 'ksux-wizard-test-')));
function check(name, body) {
  const result = spawnSync('/bin/bash', ['-c', `${definitions}\nENV_FILE="$TEST_DIRECTORY/${name}.env"\n${body}`], {
    env: { ...process.env, TEST_DIRECTORY: directory }, encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${name}: ${result.stderr}\n${result.stdout}`);
  assert.doesNotMatch(result.stdout + result.stderr, /FAKE_SECRET_VALUE/, `${name}: credential leaked`);
  console.log(`PASS ${name}`);
}
try {
  check('upsert', `
write_env EXAMPLE first
write_env EXAMPLE second
[[ "$(_existing EXAMPLE)" == second ]]
[[ "$(wc -l < "$ENV_FILE" | tr -d ' ')" == 1 ]]
[[ "$(stat -f '%Lp' "$ENV_FILE" 2>/dev/null || stat -c '%a' "$ENV_FILE")" == 600 ]]
finish
`);
  check('capture', `
capture GROQ_API_KEY 'Token:' secret <<< 'FAKE_SECRET_VALUE'
[[ "$GROQ_API_KEY" == FAKE_SECRET_VALUE ]]
capture GROQ_API_KEY 'Token:' secret <<< ''
[[ "$GROQ_API_KEY" == FAKE_SECRET_VALUE ]]
capture NEXT_PUBLIC_CONVEX_URL 'URL:' <<< 'https://sample.convex.cloud'
[[ "$NEXT_PUBLIC_CONVEX_URL" == https://sample.convex.cloud ]]
`);
  check('reject-expansion', `
capture GROQ_API_KEY 'Token:' secret <<< $'bad$expansion\nFAKE_SECRET_VALUE'
[[ "$GROQ_API_KEY" == FAKE_SECRET_VALUE ]]
`);
  check('eof-fails', `
if (capture GROQ_API_KEY 'Token:' secret </dev/null); then exit 23; fi
`);
  check('optional', `
if optional_service SETUP_GEMINI 'Gemini?' <<< n; then exit 12; fi
[[ "$SETUP_GEMINI" == no ]]
optional_service SETUP_GEMINI 'Gemini?' <<< y
[[ "$SETUP_GEMINI" == yes ]]
`);
  check('remote-stubs', `
# These functions replace remote operations. Assert secrets only enter via stdin.
convex_prod() {
  [[ "$*" == 'env set GROQ_API_KEY' ]] || return 20
  local stdin; stdin="$(</dev/stdin)"
  [[ "$stdin" == FAKE_SECRET_VALUE ]]
}
vercel() {
  [[ "$*" == 'env add GROQ_API_KEY --environment production --project prj_test --scope team_test --force --yes --sensitive' ]] || return 21
  local stdin; stdin="$(</dev/stdin)"
  [[ "$stdin" == FAKE_SECRET_VALUE ]]
}
GROQ_API_KEY=FAKE_SECRET_VALUE
VERCEL_PROJECT_ID=prj_test
VERCEL_TEAM_ID=team_test
set_convex GROQ_API_KEY
set_vercel GROQ_API_KEY secret
`);
  check('failure-stops', `
convex_prod() { return 1; }
GROQ_API_KEY=FAKE_SECRET_VALUE
if (set_convex GROQ_API_KEY); then exit 22; fi
`);
  console.log(`PASS stage count (${stages}); no GitHub-secret stage calls`);
} finally {
  // Only remove the verified directory created by this test, not a user path.
  rmSync(directory, { recursive: true, force: true });
}
