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
  SESSION_COOKIE_NAME: "owlside_session",
  createServerConvexClient: () => ({ query: mocks.query, mutation: mocks.mutation }),
}));

describe("Student session route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("OWLSIDE_SERVER_SECRET", "route-unit-test-secret");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("reports missing server configuration without contacting Convex or logging credentials", async () => {
    vi.stubEnv("OWLSIDE_SERVER_SECRET", "");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await POST(new Request("http://localhost/api/auth/session", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "verify", email: "diagnostic@example.invalid", code: "12345" }),
      }));
      expect(response.status).toBe(503);
      expect(log).toHaveBeenCalledWith("[OwlSide auth] OWLSIDE_SERVER_SECRET is missing from the server environment.");
      expect(mocks.mutation).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });

  it("validates malformed codes before contacting Convex when the server credential is configured", async () => {
    const response = await POST(new Request("http://localhost/api/auth/session", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "verify", email: "diagnostic@example.invalid", code: "12345" }),
    }));
    expect(response.status).toBe(400);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

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
    expect(mocks.setCookie).toHaveBeenCalledWith("owlside_session", "a-test-session", {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      expires: new Date(sessionExpiresAt),
    });
  });

  it("revokes the Convex Student session when signing out of the web app", async () => {
    mocks.readCookie.mockReturnValue({ value: "a-test-session" });
    mocks.mutation.mockResolvedValue({ ok: true, pushRemoved: false });

    const response = await DELETE(new Request("http://localhost/api/auth/session", { method: "DELETE" }));

    expect(response.status).toBe(200);
    expect(mocks.deleteCookie).toHaveBeenCalledWith("owlside_session");
    expect(mocks.mutation).toHaveBeenCalledTimes(1);
    const [signOut, args] = mocks.mutation.mock.calls[0]!;
    expect(getFunctionName(signOut)).toBe("auth:signOutSession");
    expect(args).toEqual({ sessionToken: "a-test-session" });
  });

  it("signs out when the framework supplies an empty body stream", async () => {
    mocks.readCookie.mockReturnValue({ value: "a-test-session" });
    mocks.mutation.mockResolvedValue({ ok: true, pushRemoved: false });
    const response = await DELETE(new Request("http://localhost/api/auth/session", {
      method: "DELETE",
      body: new ReadableStream({ start(controller) { controller.close(); } }),
      // @ts-expect-error Node's fetch requires duplex for stream bodies.
      duplex: "half",
    }));

    expect(response.status).toBe(200);
    expect(mocks.mutation.mock.calls[0]?.[1]).toEqual({ sessionToken: "a-test-session" });
    expect(mocks.deleteCookie).toHaveBeenCalledWith("owlside_session");
  });

  it("forwards the current browser's push endpoint with the cookie session", async () => {
    const pushEndpoint = "https://push.example/current-browser";
    mocks.readCookie.mockReturnValue({ value: "a-test-session" });
    mocks.mutation.mockResolvedValue({ ok: true, pushRemoved: true });
    const response = await DELETE(new Request("http://localhost/api/auth/session", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pushEndpoint }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, pushRemoved: true });
    expect(mocks.mutation.mock.calls[0]?.[1]).toEqual({ sessionToken: "a-test-session", pushEndpoint });
  });

  it("does not clear the session cookie when revocation fails and can be retried", async () => {
    mocks.readCookie.mockReturnValue({ value: "a-test-session" });
    mocks.mutation.mockRejectedValue(new Error("Temporary Convex failure"));
    const response = await DELETE(new Request("http://localhost/api/auth/session", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pushEndpoint: "https://push.example/current-browser" }),
    }));

    expect(response.status).toBe(503);
    expect(mocks.deleteCookie).not.toHaveBeenCalled();
  });
});
