// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const srcDir = path.join(root, "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(tsx?|css)$/.test(name) ? [full] : [];
  });
}

const rel = (file: string) => path.relative(root, file).split(path.sep).join("/");

// px-literal text: Tailwind arbitrary sizes, inline fontSize numbers, CSS font-size in px.
const PX_TEXT = /text-\[\d+(?:\.\d+)?px\]|fontSize:\s*["']?\d|font-size:\s*\d+(?:\.\d+)?px/;

/**
 * Screens that still carry v1 px text. Phase 1A migrates each to Direction C
 * and removes it here; this list may only shrink (docs/accessibility/migration.md).
 */
const LEGACY_PX_TEXT = new Set([
  "src/components/auth/EduOtpModal.tsx",
  "src/components/auth/OnboardingFlow.tsx",
  "src/components/chats/ChatThreadView.tsx",
  "src/components/chats/ChatsInboxView.tsx",
  "src/components/communities/ClubsViews.tsx",
  "src/components/communities/EventsViews.tsx",
  "src/components/courses/CourseHubView.tsx",
  "src/components/dining/DiningView.tsx",
  "src/components/feed/FeedView.tsx",
  "src/components/marketplace/DealHandoffPanel.tsx",
  "src/components/marketplace/MarketplaceView.tsx",
  "src/components/moderation/ModerationQueueView.tsx",
  "src/components/now/NowHudView.tsx",
  "src/components/parking/ParkingView.tsx",
  "src/components/profile/ProfileView.tsx",
  "src/components/pwa/PwaSupport.tsx",
  "src/components/scrappy/ScrappyView.tsx",
  "src/components/shared/CampusEntityCard.tsx",
  "src/components/shared/ReportTrigger.tsx",
  "src/components/shell/WelcomeGate.tsx",
  "src/components/study/StudyView.tsx",
  "src/components/transit/TransitView.tsx",
]);

describe("Layer 2 — accessibility static boundaries", () => {
  const files = sourceFiles(srcDir);

  it("keeps px-literal text out of the shell, primitives and every new screen", () => {
    const offenders = files
      .filter((file) => !LEGACY_PX_TEXT.has(rel(file)))
      .filter((file) => readFileSync(file, "utf8").split("\n").some((line) => PX_TEXT.test(line)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("only lists legacy screens that still need migrating", () => {
    const stale = [...LEGACY_PX_TEXT].filter((file) => {
      try {
        return !PX_TEXT.test(readFileSync(path.join(root, file), "utf8"));
      } catch {
        return true;
      }
    });
    expect(stale, "Remove migrated files from LEGACY_PX_TEXT").toEqual([]);
  });

  it("defines Direction C type tokens in rem with nothing under 13 px", () => {
    const css = readFileSync(path.join(srcDir, "app/globals.css"), "utf8");
    const sizes = [...css.matchAll(/--fs-[a-z0-9]+:\s*([\d.]+)rem/g)].map((m) => Number(m[1]));
    expect(sizes).toHaveLength(7);
    for (const size of sizes) expect(size * 16).toBeGreaterThanOrEqual(13);
    expect(css).toMatch(/--target:\s*2\.75rem/);
    expect(css).toContain("prefers-reduced-motion: reduce");
  });

  it("never locks orientation", () => {
    const manifest = readFileSync(path.join(srcDir, "app/manifest.ts"), "utf8");
    expect(manifest).not.toMatch(/orientation:/);
  });
});
