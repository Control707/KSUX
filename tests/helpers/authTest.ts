import { vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { createTestConvex } from "./convexTestEnv";

type TestConvex = ReturnType<typeof createTestConvex>;
export const TEST_SERVER_SECRET = "ksux-test-server-secret-for-unit-tests";

async function atTime<T>(now: number | undefined, run: () => Promise<T>) {
  if (now === undefined) return run();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  try {
    return await run();
  } finally {
    vi.useRealTimers();
  }
}

export function requestTestOtp(t: TestConvex, args: { email: string; clientIpHint?: string; nowOverride?: number }) {
  return atTime(args.nowOverride, () => t.mutation(api.auth.requestEmailOtp, {
    email: args.email,
    clientNetwork: args.clientIpHint ?? "test-network",
    serverSecret: TEST_SERVER_SECRET,
  }));
}

export function verifyTestOtp(t: TestConvex, args: { email: string; code: string; nowOverride?: number }) {
  return atTime(args.nowOverride, () => t.mutation(api.auth.verifyEmailOtp, {
    email: args.email,
    code: args.code,
    serverSecret: TEST_SERVER_SECRET,
  }));
}

export async function reserveTestUpload(
  t: TestConvex,
  args: {
    demoShortCode?: string;
    demoPersonaHandle?: string;
    sessionToken?: string;
    purpose: "avatar" | "post" | "listing" | "chat";
    byteSize: number;
    width: number;
    height: number;
    fileKey: string;
    url: string;
  }
) {
  const { fileKey, url, ...envelopeAndInput } = args;
  const reservationId = await t.mutation(api.uploads.reserveUpload, {
    ...envelopeAndInput,
    serverSecret: TEST_SERVER_SECRET,
  });
  const { purpose: _purpose, byteSize: _bytes, width: _width, height: _height, ...auth } = envelopeAndInput;
  return { ...auth, fileKey, url, reservationId, serverSecret: TEST_SERVER_SECRET };
}
