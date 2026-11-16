import { describe, expect, it } from "vitest";
import {
  decodeSlotMask48Slots,
  encodeLibCalSlotsToMask48,
} from "../../convex/sync/libcalSync";

describe("Seam 2 — Springshare LibCal 48-bit BigInt Slot Mask Encoder (#22)", () => {
  it("encodes 00:00–24:00 half-hour slots into a 64-bit BigInt without 32-bit truncation on evening bits 32..47", () => {
    const dateET = "2026-11-16";
    const slots = [
      // 08:00 AM -> bit 16 (OPEN — no className)
      { start: "2026-11-16 08:00:00", itemId: 74084 },
      // 08:30 AM -> bit 17 (BOOKED — s-lc-eq-checkout)
      {
        start: "2026-11-16 08:30:00",
        itemId: 74084,
        className: "s-lc-eq-checkout",
      },
      // 06:30 PM (18:30) -> bit 37 (>31, tests 64-bit BigInt safety!)
      { start: "2026-11-16 18:30:00", itemId: 74084 },
      // 11:30 PM (23:30) -> bit 47 (highest slot!)
      { start: "2026-11-16 23:30:00", itemId: 74084 },
      // Different room itemId ignored
      { start: "2026-11-16 09:00:00", itemId: 99999 },
    ];

    const mask = encodeLibCalSlotsToMask48(slots, 74084, dateET);
    expect(typeof mask).toBe("bigint");
    expect(mask).toBe((1n << 16n) | (1n << 37n) | (1n << 47n));

    const decoded = decodeSlotMask48Slots(mask);
    expect(decoded).toHaveLength(48);
    expect(decoded[16]).toBe(true);
    expect(decoded[17]).toBe(false);
    expect(decoded[37]).toBe(true);
    expect(decoded[47]).toBe(true);
  });
});
