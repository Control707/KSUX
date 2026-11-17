// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { POST } from "../../src/app/api/scrappy/stream/route";

const mocks = vi.hoisted(() => ({
  action: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    action = mocks.action;
  },
}));

const citation = {
  entityType: "parking_lot",
  entityId: "central-deck",
  label: "Central Parking Deck",
  href: "/parking",
};
const draftCard = {
  draftKind: "post",
  title: "Campus update",
  summary: "Draft a campus update",
  payloadJson: '{"body":"Spring campus update"}',
};
const answer = {
  threadId: "example-thread",
  content: "Hoot! Central Parking Deck is filling.",
  citations: [citation],
  draftCard,
  providerUsed: "grounded_local",
};

function request(body: unknown, headers?: Record<string, string>) {
  return new Request("https://ksux.example/api/scrappy/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function readEvents(response: Response) {
  const text = await response.text();
  return text.trim().split("\n\n").map((frame) => {
    const [eventLine, dataLine] = frame.split("\n");
    expect(eventLine).toMatch(/^event: /);
    expect(dataLine).toMatch(/^data: /);
    return { event: eventLine.slice(7), data: JSON.parse(dataLine.slice(6)) };
  });
}

describe("Ask Scrappy HTTP workflow", () => {
  beforeEach(() => {
    mocks.action.mockReset().mockResolvedValue(answer);
    mocks.cookies.mockReset().mockResolvedValue({
      get: (name: string) => name === "ksux_session" ? { value: " student-session " } : undefined,
    });
  });

  it("rejects a request without an auth envelope before calling Convex", async () => {
    mocks.cookies.mockResolvedValue({ get: () => undefined });
    const response = await POST(request({ prompt: "Where can I park?" }));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: expect.any(String) });
    expect(mocks.action).not.toHaveBeenCalled();
  });

  it("returns bad request for a blank prompt without starting a turn", async () => {
    const response = await POST(request({ prompt: "  \n " }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Missing prompt." });
    expect(mocks.action).not.toHaveBeenCalled();
  });

  for (const { name, body } of [
    { name: "null body", body: null },
    { name: "non-string prompt", body: { prompt: 42 } },
  ]) {
    it(`returns bad request for a ${name}`, async () => {
      const response = await POST(request(body));
      expect(mocks.action).not.toHaveBeenCalled();
      expect(response.status).toBe(400);
    });
  }

  it("forwards the student cookie, thread and context with the trimmed prompt", async () => {
    const contextEntity = { entityType: "parking_lot", entityId: "central", label: "Central" };
    const response = await POST(request({ threadId: "example-thread", contextEntity, prompt: "   Where can I park? " }));
    const events = await readEvents(response);

    expect(mocks.action).toHaveBeenCalledExactlyOnceWith(api.scrappy.threads.askScrappyAction, {
      sessionToken: "student-session",
      threadId: "example-thread",
      contextEntity,
      prompt: "Where can I park?",
    });
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    expect(events.find(({ event }) => event === "meta")).toEqual({ event: "meta", data: { threadId: answer.threadId, providerUsed: answer.providerUsed } });
    expect(events.filter(({ event }) => event === "delta").map(({ data }) => data.text).join("")).toBe(answer.content);
    expect(events.slice(-3)).toEqual([
      { event: "citations", data: { citations: [citation] } },
      { event: "draft", data: { draftCard } },
      { event: "done", data: { threadId: answer.threadId } },
    ]);
  });

  it("uses normalized demo credentials instead of the cookie in a demo tab", async () => {
    const response = await POST(request({ prompt: "Where can I park?" }, {
      "x-ksux-demo-session": " Demo123 ",
      "x-ksux-demo-persona": " ALEX_OWL ",
    }));
    await response.text();

    expect(mocks.action).toHaveBeenCalledExactlyOnceWith(api.scrappy.threads.askScrappyAction, {
      demoShortCode: "demo123",
      demoPersonaHandle: "alex_owl",
      prompt: "Where can I park?",
      threadId: undefined,
      contextEntity: undefined,
    });
  });

  it("terminates the response with an error event when the turn fails", async () => {
    mocks.action.mockRejectedValueOnce({ data: { message: "Ask Scrappy quota exceeded." } });
    const response = await POST(request({ prompt: "Where can I park?" }));

    expect(await readEvents(response)).toEqual([
      { event: "progress", data: { message: expect.any(String) } },
      { event: "error", data: { message: "Ask Scrappy quota exceeded." } },
    ]);
  });

  for (const { name, content } of [
    { name: "paragraph spacing", content: "Parking\n\nThe next bus arrives in five minutes." },
    { name: "long words", content: "Park at EastDeckAccessibleOverflowEntranceAndShuttleStopNumberTwenty today." },
  ]) {
    it(`preserves ${name} across deltas`, async () => {
      mocks.action.mockResolvedValueOnce({ ...answer, content });
      const response = await POST(request({ prompt: "Where can I park?" }));
      const events = await readEvents(response);
      expect(events.at(-1)?.event).toBe("done");
      const reconstructed = events
        .filter(({ event }) => event === "delta")
        .map(({ data }) => data.text)
        .join("");

      expect(reconstructed).toBe(content);
    });
  }

  it("reports progress before the Convex turn completes", async () => {
    let completeTurn!: (value: typeof answer) => void;
    mocks.action.mockReturnValueOnce(new Promise((resolve) => { completeTurn = resolve; }));

    const response = await POST(request({ prompt: "Where can I park?" }));
    const reader = response.body!.getReader();
    const initialFrame = await reader.read();
    expect(new TextDecoder().decode(initialFrame.value)).toContain("event: progress\n");
    await reader.cancel();
    completeTurn(answer);
  });
});
