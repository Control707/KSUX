import { describe, expect, it } from "vitest";
import {
  computeBoundedDimensions,
  MAX_IMAGE_DIMENSION,
} from "../../src/lib/imageCompression";

describe("client-side WebP dimension & still-image bounds", () => {
  it("preserves dimensions when already <= 1440px", () => {
    expect(computeBoundedDimensions(1200, 900)).toEqual({
      width: 1200,
      height: 900,
    });
    expect(computeBoundedDimensions(1440, 1440)).toEqual({
      width: 1440,
      height: 1440,
    });
  });

  it("scales landscape and portrait photos down proportionally to <= 1440px", () => {
    const landscape = computeBoundedDimensions(4032, 3024, MAX_IMAGE_DIMENSION);
    expect(landscape.width).toBe(1440);
    expect(landscape.height).toBe(1080);

    const portrait = computeBoundedDimensions(2880, 4320, MAX_IMAGE_DIMENSION);
    expect(portrait.width).toBe(960);
    expect(portrait.height).toBe(1440);
  });

  it("rejects zero or negative dimensions", () => {
    expect(() => computeBoundedDimensions(0, 800)).toThrow(
      /Invalid source image dimensions/
    );
  });
});
