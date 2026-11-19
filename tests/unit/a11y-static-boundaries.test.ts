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
 * Screens that still carry v1 px text. Phase 1A (#74) migrated every screen,
 * so this is empty and must stay empty (docs/accessibility/migration.md).
 */
const LEGACY_PX_TEXT = new Set<string>([]);

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

  it("keeps hex colours out of migrated screens so both themes come from tokens", () => {
    // Only the token sheet, the browser theme-color meta and the MapLibre
    // paint expressions (which can't read CSS variables) may hold literals.
    const HEX_ALLOWED = new Set([
      "src/app/globals.css",
      "src/app/layout.tsx",
      "src/components/map/CampusGeoMap.tsx",
      "src/components/map/mapFeatures.ts",
      ...LEGACY_PX_TEXT,
    ]);
    const HEX = /#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b(?![0-9A-Za-z])/;
    const offenders = files
      .filter((file) => file.endsWith(".tsx") && !HEX_ALLOWED.has(rel(file)))
      .filter((file) => readFileSync(file, "utf8").split("\n").some((line) => HEX.test(line)))
      .map(rel);
    expect(offenders).toEqual([]);
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
