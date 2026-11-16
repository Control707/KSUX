import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { api } from "@convex/_generated/api";
import {
  createServerConvexClient,
  SESSION_COOKIE_NAME,
} from "@/lib/convexHttp";

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value?.trim();
  if (!token) {
    return NextResponse.json({ authenticated: false });
  }

  try {
    const client = createServerConvexClient();
    const summary = await client.query(api.shell.shellSummary, {
      sessionToken: token,
    });
    return NextResponse.json({
      authenticated: true,
      sessionToken: token,
      student: summary.viewer.student,
      isModerator: summary.viewer.isModerator,
    });
  } catch {
    cookieStore.delete(SESSION_COOKIE_NAME);
    return NextResponse.json({ authenticated: false });
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    sessionToken?: string;
  };
  const token = body.sessionToken?.trim();
  if (!token) {
    return NextResponse.json(
      { error: "Missing sessionToken" },
      { status: 400 }
    );
  }

  try {
    const client = createServerConvexClient();
    const summary = await client.query(api.shell.shellSummary, {
      sessionToken: token,
    });

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: THIRTY_DAYS_SECONDS,
    });

    return NextResponse.json({
      authenticated: true,
      student: summary.viewer.student,
    });
  } catch {
    return NextResponse.json(
      { error: "Invalid or expired sessionToken" },
      { status: 401 }
    );
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value?.trim();
  if (token) {
    try {
      const client = createServerConvexClient();
      // Best-effort server revocation if auth module is active
      if ("auth" in api && "signOutSession" in (api as any).auth) {
        await client.mutation((api as any).auth.signOutSession, {
          sessionToken: token,
        });
      }
    } catch {
      // Ignore already-expired session
    }
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
