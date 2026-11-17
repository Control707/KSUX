type ScrappyAnswer = {
  threadId: string;
  providerUsed: string;
  content: string;
  citations: unknown[];
  draftCard?: unknown;
};

export function createScrappyEventStream(runTurn: (onDelta: (text: string) => void) => Promise<ScrappyAnswer>) {
  let cancelled = false;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (!cancelled) controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      send("progress", { message: "Checking campus data…" });
      let emitted = false;
      void runTurn((text) => {
        emitted = true;
        send("delta", { text });
      }).then((result) => {
        send("meta", { threadId: result.threadId, providerUsed: result.providerUsed });
        if (!emitted) send("delta", { text: result.content });
        if (result.citations.length) send("citations", { citations: result.citations });
        if (result.draftCard) send("draft", { draftCard: result.draftCard });
        send("done", { threadId: result.threadId });
      }).catch((error: unknown) => {
        const detail = (error as { data?: { message?: string } })?.data;
        send("error", { message: detail?.message ?? (error instanceof Error ? error.message : "Ask Scrappy turn failed.") });
      }).finally(() => {
        if (!cancelled) controller.close();
      });
    },
    cancel() { cancelled = true; },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform" },
  });
}
