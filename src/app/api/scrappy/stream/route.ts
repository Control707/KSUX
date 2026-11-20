import { createScrappyEventStream } from "@convex/lib/scrappyStream";
import { NextResponse } from "next/server";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import {
  createServerConvexClient,
  extractForwardedAuthEnvelope,
} from "@/lib/convexHttp";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isContextEntity(value: unknown): value is {
  entityType: string;
  entityId: string;
  label: string;
} {
  return isObject(value) &&
    Object.keys(value).length === 3 &&
    [value.entityType, value.entityId, value.label].every(
      (field) => typeof field === "string" && field.trim().length > 0 && field.length <= 240
    );
}

/**
 * Stateless HTTP SSE Route Handler for 1:1 Ask Scrappy threads.
 * Forwards the HttpOnly session cookie or Judge Demo Mode headers directly to Convex `viewerContext`.
 */
export async function POST(request: Request) {
  const authEnvelope = await extractForwardedAuthEnvelope(request);
  if (!authEnvelope.sessionToken && !authEnvelope.demoShortCode) {
    return NextResponse.json(
      { error: "Authentication required for Ask Scrappy." },
      { status: 401 }
    );
  }

  const body: unknown = await request.json().catch(() => null);
  if (!isObject(body) || typeof body.prompt !== "string") {
    return NextResponse.json({ error: "A string prompt is required." }, { status: 400 });
  }

  const prompt = body.prompt.trim();
  if (!prompt) {
    return NextResponse.json({ error: "Missing prompt." }, { status: 400 });
  }
  if (prompt.length > 1500) {
    return NextResponse.json({ error: "Ask Scrappy prompt must be 1–1,500 characters." }, { status: 400 });
  }

  const { threadId, contextEntity } = body;
  if ((threadId !== undefined && (typeof threadId !== "string" || !threadId.trim())) ||
      (contextEntity !== undefined && !isContextEntity(contextEntity))) {
    return NextResponse.json({ error: "Invalid thread or entity context." }, { status: 400 });
  }

  const args = {
    ...authEnvelope,
    threadId: threadId as Id<"scrappyThreads"> | undefined,
    prompt,
    contextEntity,
  };
  const siteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  const credential = process.env.OWLSIDE_SERVER_SECRET;
  if (siteUrl && credential) {
    try {
      const upstream = await fetch(new URL("/scrappy/stream", siteUrl), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-owlside-server-credential": credential,
        },
        body: JSON.stringify(args),
        cache: "no-store",
        redirect: "error",
        signal: request.signal,
      });
      if (upstream.ok && upstream.body && upstream.headers.get("content-type")?.includes("text/event-stream")) {
        return new Response(upstream.body, {
          headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform" },
        });
      }
    } catch {
      // The upstream turn may have started, so avoid submitting a second copy.
    }
    return NextResponse.json({ error: "The Scrappy stream is temporarily unavailable." }, { status: 502 });
  }
  const client = createServerConvexClient();
  return createScrappyEventStream(() => client.action(api.scrappy.threads.askScrappyAction, args));
}
