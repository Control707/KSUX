import { describe, expect, it } from "vitest";
import { unionBBox, type BBox } from "../../src/components/map/mapFeatures";

describe("map bounding-box union", () => {
  it("returns null when no finite bounds are available", () => {
    expect(unionBBox([])).toBeNull();
    expect(unionBBox([
      [Infinity, 0, 1, 1],
      [0, NaN, 1, 1],
      [0, 0, -Infinity, 1],
    ])).toBeNull();
  });

  it("combines finite bounds and skips an entire non-finite box", () => {
    expect(unionBBox([
      [-84.59, 34.02, -84.57, 34.05],
      [-84.535, 33.925, -84.51, 33.95],
      [-100, 0, Infinity, 90],
    ])).toEqual([-84.59, 33.925, -84.51, 34.05]);
  });

  it("returns independent bounds without mutating its inputs", () => {
    const first: BBox = [-84.59, 34.02, -84.57, 34.05];
    const second: BBox = [-84.535, 33.925, -84.51, 33.95];
    const original = [...first];
    expect(unionBBox([first])).toEqual(first);
    expect(unionBBox([first])).not.toBe(first);
    unionBBox([first, second]);
    expect(first).toEqual(original);
  });

  it("handles large feature lists without spreading them into function arguments", () => {
    const boxes = Array.from({ length: 150_000 }, (_, index): BBox => [index, -index, index + 1, 1]);
    expect(unionBBox(boxes)).toEqual([0, -149_999, 150_000, 1]);
  });
});
