import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { api } from "@convex/_generated/api";
import { createServerConvexClient, SESSION_COOKIE_NAME } from "@/lib/convexHttp";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

function authError(error: unknown) {
  const detail = (error as { data?: { code?: string; message?: string } })?.data;
  if (detail?.code === "UNAUTHENTICATED") return json({ authenticated: false }, 401);
  if (detail?.code === "INVALID_EMAIL_DOMAIN") return json({ error: detail.message }, 400);
  if (detail?.code === "ACCOUNT_SUSPENDED") return json({ error: detail.message }, 403);
  if (detail?.code === "RATE_LIMITED") return json({ error: detail.message }, 429);
  return json({ error: "The sign-in service is temporarily unavailable." }, 503);
}

function configuredServerSecret() {
  const secret = process.env.OWLSIDE_SERVER_SECRET;
  if (!secret) console.error("[OwlSide auth] OWLSIDE_SERVER_SECRET is missing from the server environment.");
  return secret;
}

async function writeSessionCookie(cookieStore: Awaited<ReturnType<typeof cookies>>, token: string, expiresAt: number) {
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
}

function clientNetwork(request: Request) {
  // Vercel supplies this address at its ingress boundary. Local development has no trusted proxy.
  if (process.env.VERCEL !== "1") return "local-development";
  const address = request.headers.get("x-vercel-forwarded-for")?.trim();
  return address && isIP(address) ? address : null;
}

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value?.trim();
  if (!token) return json({ authenticated: false });

  const serverSecret = configuredServerSecret();
  if (!serverSecret) return authError(null);
  try {
    const client = createServerConvexClient();
    const session = await client.mutation(api.auth.getBrowserSession, { sessionToken: token, serverSecret });
    await writeSessionCookie(cookieStore, token, session.sessionExpiresAt);
    return json({ authenticated: true, ...session });
  } catch (error) {
    const response = authError(error);
    if (response.status === 401) cookieStore.delete(SESSION_COOKIE_NAME);
    return response;
  }
}

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: "A JSON request body is required." }, 415);
  }
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !("email" in body) || typeof body.email !== "string" ||
      body.email.length > 320 || !("operation" in body)) {
    return json({ error: "A valid email and sign-in operation are required." }, 400);
  }

  const serverSecret = configuredServerSecret();
  if (!serverSecret) return authError(null);
  try {
    const client = createServerConvexClient();
    if (body.operation === "request") {
      const network = clientNetwork(request);
      if (!network) return authError(null);
      return json(await client.mutation(api.auth.requestEmailOtp, {
        email: body.email,
        clientNetwork: network,
        serverSecret,
      }));
    }

    if (body.operation !== "verify" || !("code" in body) || typeof body.code !== "string" ||
        !/^\d{6}$/.test(body.code.trim())) {
      return json({ error: "A six-digit verification code is required." }, 400);
    }

    const result = await client.mutation(api.auth.verifyEmailOtp, {
      email: body.email,
      code: body.code,
      userAgent: request.headers.get("user-agent")?.slice(0, 256),
      serverSecret,
    });
    if (!result.ok) return json(result, 401);

    await writeSessionCookie(await cookies(), result.sessionToken, result.sessionExpiresAt);
    return json({
      authenticated: true,
      browserCredential: result.browserCredential,
      expiresAt: result.expiresAt,
      sessionExpiresAt: result.sessionExpiresAt,
      student: result.student,
      isModerator: result.isModerator,
      needsOnboarding: result.needsOnboarding,
    });
  } catch (error) {
    return authError(error);
  }
}

export async function DELETE(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value?.trim();
  if (token) {
    let pushEndpoint: string | undefined;
    // Next.js gives every non-GET/HEAD request a body stream, even when it is empty,
    // so decide on the actual content rather than on `request.body` being present.
    const rawBody = await request.text().catch(() => "");
    if (rawBody.trim()) {
      let body: unknown = null;
      try { body = JSON.parse(rawBody); } catch { body = null; }
      if (!body || typeof body !== "object" || !("pushEndpoint" in body) ||
          typeof body.pushEndpoint !== "string" || !body.pushEndpoint.trim() || body.pushEndpoint.length > 4096) {
        return json({ error: "Invalid push subscription endpoint." }, 400);
      }
      pushEndpoint = body.pushEndpoint;
    }
    try {
      const client = createServerConvexClient();
      const result = await client.mutation(api.auth.signOutSession, {
        sessionToken: token,
        ...(pushEndpoint ? { pushEndpoint } : {}),
      });
      cookieStore.delete(SESSION_COOKIE_NAME);
      return json(result);
    } catch (error) {
      const response = authError(error);
      if (response.status !== 401) return response;
    }
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
  return json({ ok: true, pushRemoved: false });
}
