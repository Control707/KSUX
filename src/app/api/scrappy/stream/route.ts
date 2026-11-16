import { NextResponse } from "next/server";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import {
  createServerConvexClient,
  extractForwardedAuthEnvelope,
} from "@/lib/convexHttp";

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

  const body = (await request.json().catch(() => ({}))) as {
    threadId?: string;
    prompt?: string;
    contextEntity?: {
      entityType: string;
      entityId: string;
      label: string;
    };
  };

  const prompt = body.prompt?.trim();
  if (!prompt) {
    return NextResponse.json({ error: "Missing prompt." }, { status: 400 });
  }

  const client = createServerConvexClient();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        const result = await client.action(
          api.scrappy.threads.askScrappyAction,
          {
            ...authEnvelope,
            threadId: body.threadId
              ? (body.threadId as Id<"scrappyThreads">)
              : undefined,
            prompt,
            contextEntity: body.contextEntity,
          }
        );

        sendEvent("meta", {
          threadId: result.threadId,
          providerUsed: result.providerUsed,
        });

        // Stream tokens cleanly in word-group SSE deltas
        const chunks = result.content.match(/.{1,36}(\s|$)/g) ?? [
          result.content,
        ];
        for (const chunk of chunks) {
          sendEvent("delta", { text: chunk });
        }

        if (result.citations.length > 0) {
          sendEvent("citations", { citations: result.citations });
        }
        if (result.draftCard) {
          sendEvent("draft", { draftCard: result.draftCard });
        }
        sendEvent("done", { threadId: result.threadId });
      } catch (err: any) {
        sendEvent("error", {
          message:
            err?.data?.message || err?.message || "Ask Scrappy turn failed.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
