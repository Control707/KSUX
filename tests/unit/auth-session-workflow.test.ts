import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, POST } from "../../src/app/api/auth/session/route";

const mocks = vi.hoisted(() => ({
  readCookie: vi.fn(),
  setCookie: vi.fn(),
  deleteCookie: vi.fn(),
  query: vi.fn(),
  mutation: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: mocks.readCookie,
    set: mocks.setCookie,
    delete: mocks.deleteCookie,
  }),
}));

vi.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) },
}));

vi.mock("@/lib/convexHttp", () => ({
  SESSION_COOKIE_NAME: "ksux_session",
  createServerConvexClient: () => ({ query: mocks.query, mutation: mocks.mutation }),
}));

describe("Student session route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("KSUX_SERVER_SECRET", "route-unit-test-secret");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("exchanges a valid OTP for a credential and keeps the long-lived token in an HttpOnly cookie", async () => {
    const student = { handle: "alex_session" };
    const sessionExpiresAt = Date.UTC(2027, 0, 1);
    mocks.mutation.mockResolvedValue({
      ok: true, student, sessionToken: "a-test-session", browserCredential: "short-lived",
      sessionExpiresAt, expiresAt: sessionExpiresAt - 1000,
      isModerator: false, needsOnboarding: false,
    });
    const response = await POST(new Request("http://localhost/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "verify", email: "alex@kennesaw.edu", code: "123456" }),
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ authenticated: true, student, browserCredential: "short-lived" });
    expect(body).not.toHaveProperty("sessionToken");
    expect(mocks.mutation).toHaveBeenCalledTimes(1);
    expect(getFunctionName(mocks.mutation.mock.calls[0]![0])).toBe("auth:verifyEmailOtp");
    expect(mocks.setCookie).toHaveBeenCalledWith("ksux_session", "a-test-session", {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      expires: new Date(sessionExpiresAt),
    });
  });

  it("revokes the Convex Student session when signing out of the web app", async () => {
    mocks.readCookie.mockReturnValue({ value: "a-test-session" });
    mocks.mutation.mockResolvedValue({ ok: true });

    const response = await DELETE();

    expect(response.status).toBe(200);
    expect(mocks.deleteCookie).toHaveBeenCalledWith("ksux_session");
    expect(mocks.mutation).toHaveBeenCalledTimes(1);
    const [signOut, args] = mocks.mutation.mock.calls[0]!;
    expect(getFunctionName(signOut)).toBe("auth:signOutSession");
    expect(args).toEqual({ sessionToken: "a-test-session" });
  });
});
