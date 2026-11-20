import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { createScrappyEventStream } from "./lib/scrappyStream";
import { requireServerSecret } from "./lib/sessionCredential";
import { runAskScrappyTurn, type AskScrappyInput } from "./scrappy/threads";

const http = httpRouter();

http.route({
  path: "/scrappy/stream",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      await requireServerSecret(request.headers.get("x-owlside-server-credential") ?? "");
    } catch {
      return Response.json({ error: "Forbidden." }, { status: 403 });
    }
    const args = await request.json().catch(() => null) as AskScrappyInput | null;
    if (typeof args?.prompt !== "string" || !args.prompt.trim() || args.prompt.length > 1500) {
      return Response.json({ error: "A valid prompt is required." }, { status: 400 });
    }
    return createScrappyEventStream((onDelta) => runAskScrappyTurn(ctx, args, onDelta));
  }),
});

export default http;
