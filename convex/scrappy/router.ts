export type ScrappyInvocationMode = "ask_scrappy" | "feed_mention";

export interface ScrappyToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ScrappyTurnMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
}

export interface ScrappyRouterEnv {
  groqApiKey?: string;
  geminiApiKey?: string;
  cloudflareAccountId?: string;
  cloudflareApiToken?: string;
}

export interface ProviderHttpResponse {
  ok: boolean;
  status: number;
  json: () => Promise<any>;
}

export type ProviderFetchFn = (
  url: string,
  init: RequestInit
) => Promise<ProviderHttpResponse>;

const GROQ_UNCACHED_TOKEN_CEILING = 4500;

export function fenceUntrustedCampusText(raw: string, maxChars = 280): string {
  const sanitized = raw
    .replace(/<\/?untrusted_campus_content>/gi, "")
    .trim()
    .slice(0, maxChars);
  return `<untrusted_campus_content>${sanitized}</untrusted_campus_content>`;
}

/**
 * Mandatory PII-stripping guardrail before routing any overflow prompt to Google Gemini Free Tier.
 * Removes .edu email addresses and internal record identifiers.
 */
export function stripPiiForGeminiFailover(text: string): string {
  return text
    .replace(
      /[a-zA-Z0-9._%+-]+@(?:students\.)?kennesaw\.edu/gi,
      "[redacted-ksu-email]"
    )
    .replace(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g, "[redacted-email]")
    .replace(/\b(?:id|studentId|sessionToken|demo:[a-z0-9_]+)\s*[:=]\s*["']?[a-zA-Z0-9:_-]{8,}["']?/gi, "[redacted-id]")
    .replace(/\bdemo:[a-z0-9]{10,}\b/gi, "demo:[redacted]");
}

export function estimateUncachedInputTokens(
  messages: ScrappyTurnMessage[]
): number {
  // System prefix (index 0) is prefix-cached on Groq; count non-system dynamic chars / 4
  let dynamicChars = 0;
  for (let i = 1; i < messages.length; i++) {
    dynamicChars += messages[i]!.content.length;
  }
  return Math.ceil(dynamicChars / 4);
}

export interface ScrappyProviderSelection {
  tier: "groq_primary" | "gemini_overflow" | "cloudflare_fallback";
  model: string;
  endpoint: string;
  apiKey: string;
  requiresPiiStrip: boolean;
}

export function buildOrderedProviderChain(
  mode: ScrappyInvocationMode,
  messages: ScrappyTurnMessage[],
  env: ScrappyRouterEnv
): ScrappyProviderSelection[] {
  const uncachedTokens = estimateUncachedInputTokens(messages);
  const skipGroqForLongContext = uncachedTokens > GROQ_UNCACHED_TOKEN_CEILING;
  const chain: ScrappyProviderSelection[] = [];

  if (env.groqApiKey && !skipGroqForLongContext) {
    chain.push({
      tier: "groq_primary",
      model:
        mode === "ask_scrappy"
          ? "openai/gpt-oss-120b"
          : "openai/gpt-oss-20b",
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
      apiKey: env.groqApiKey,
      requiresPiiStrip: false,
    });
  }

  if (env.geminiApiKey) {
    chain.push({
      tier: "gemini_overflow",
      model:
        uncachedTokens > 12_000
          ? "gemini-4-hydrogen"
          : "gemini-3.5-flash-lite",
      endpoint:
        "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      apiKey: env.geminiApiKey,
      requiresPiiStrip: true,
    });
  }

  if (env.cloudflareAccountId && env.cloudflareApiToken) {
    chain.push({
      tier: "cloudflare_fallback",
      model: "@cf/google/gemma-4-26b-a4b-it",
      endpoint: `https://api.cloudflare.com/client/v4/accounts/${env.cloudflareAccountId}/ai/v1/chat/completions`,
      apiKey: env.cloudflareApiToken,
      requiresPiiStrip: false,
    });
  }

  return chain;
}

export async function invokeThreeTierScrappyCompletion(params: {
  mode: ScrappyInvocationMode;
  messages: ScrappyTurnMessage[];
  tools?: ScrappyToolSpec[];
  env: ScrappyRouterEnv;
  fetchImpl?: ProviderFetchFn;
}): Promise<{
  providerUsed: string;
  content: string;
  toolCalls: Array<{ id: string; name: string; argumentsJson: string }>;
}> {
  const fetchFn = params.fetchImpl ?? (fetch as unknown as ProviderFetchFn);
  const chain = buildOrderedProviderChain(
    params.mode,
    params.messages,
    params.env
  );

  if (chain.length === 0) {
    throw new Error("NO_SCRAPPY_PROVIDER_KEYS_CONFIGURED");
  }

  let lastError: unknown;

  for (const target of chain) {
    const outgoingMessages = target.requiresPiiStrip
      ? params.messages.map((m) => ({
          ...m,
          content: stripPiiForGeminiFailover(m.content),
        }))
      : params.messages;

    const bodyPayload: Record<string, unknown> = {
      model: target.model,
      temperature: 0.2,
      messages: outgoingMessages,
    };

    if (params.tools && params.tools.length > 0) {
      bodyPayload.tools = params.tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
      bodyPayload.tool_choice = "auto";
    }

    try {
      const resp = await fetchFn(target.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${target.apiKey}`,
        },
        body: JSON.stringify(bodyPayload),
        signal: AbortSignal.timeout(12_000),
      });

      // Fail over automatically on HTTP 429 rate-limit or 5xx upstream errors
      if (!resp.ok) {
        lastError = new Error(
          `${target.tier} (${target.model}) returned HTTP ${resp.status}`
        );
        continue;
      }

      const json = await resp.json();
      const choice = json?.choices?.[0]?.message ?? {};
      const rawCalls: any[] = Array.isArray(choice.tool_calls)
        ? choice.tool_calls
        : [];

      return {
        providerUsed: `${target.tier}:${target.model}`,
        content: String(choice.content ?? "").trim(),
        toolCalls: rawCalls
          .filter((tc) => tc?.function?.name)
          .map((tc, idx) => ({
            id: String(tc.id ?? `call_${idx}`),
            name: String(tc.function.name),
            argumentsJson: String(tc.function.arguments ?? "{}"),
          })),
      };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("All 3 Scrappy LLM provider tiers failed.");
}

export async function generateOptionalEmbedding768(
  text: string,
  env: Pick<ScrappyRouterEnv, "cloudflareAccountId" | "cloudflareApiToken">,
  fetchImpl: ProviderFetchFn = fetch as unknown as ProviderFetchFn
): Promise<number[] | null> {
  if (!env.cloudflareAccountId || !env.cloudflareApiToken) {
    return null;
  }
  const clean = text.trim().slice(0, 2000);
  if (clean.length < 15) return null;

  try {
    const resp = await fetchImpl(
      `https://api.cloudflare.com/client/v4/accounts/${env.cloudflareAccountId}/ai/v1/embeddings`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.cloudflareApiToken}`,
        },
        body: JSON.stringify({
          model: "@cf/google/embeddinggemma-2",
          input: [clean],
        }),
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!resp.ok) return null;
    const json = await resp.json();
    const vec = json?.data?.[0]?.embedding;
    return Array.isArray(vec) && vec.length === 768 ? vec : null;
  } catch {
    return null;
  }
}

export function maybeBuildClientDraftCard(prompt: string): {
  draftKind: "post" | "listing" | "parking_report" | "study_session";
  title: string;
  summary: string;
  payloadJson: string;
} | null {
  const lower = prompt.toLowerCase();
  const wantsDraft =
    /\b(?:create|draft|publish|post|sell|list|submit|report|host)\b/.test(lower);
  if (!wantsDraft) return null;

  if (/\b(?:sell|listing|marketplace|textbook|calculator|obo)\b/.test(lower)) {
    return {
      draftKind: "listing",
      title: "Draft Marketplace Listing",
      summary: prompt.slice(0, 140),
      payloadJson: JSON.stringify({
        title: prompt.replace(/^.*?(?:sell|list)\s+/i, "").slice(0, 70) || "Campus Item",
        description: prompt.slice(0, 300),
        priceDollars: 40,
      }),
    };
  }

  if (/\b(?:parking\s+report|deck\s+is\s+full|lot\s+is\s+full|leaving\s+in)\b/.test(lower)) {
    return {
      draftKind: "parking_report",
      title: "Draft Parking Report",
      summary: "Review lot & fullness tier before publishing.",
      payloadJson: JSON.stringify({
        lotSlug: /marietta/i.test(lower)
          ? "marietta-west-deck"
          : "central-parking-deck",
      }),
    };
  }

  if (/\b(?:study\s+session|study\s+group|host\s+a\s+review)\b/.test(lower)) {
    return {
      draftKind: "study_session",
      title: "Draft Study Session",
      summary: prompt.slice(0, 140),
      payloadJson: JSON.stringify({
        title: prompt.slice(0, 80),
        topicNote: "Review & confirm room and time window before publishing.",
      }),
    };
  }

  if (/\b(?:draft\s+a\s+post|write\s+a\s+post|publish\s+a\s+post|create\s+a\s+post)\b/.test(lower)) {
    return {
      draftKind: "post",
      title: "Draft Campus Feed Post",
      summary: prompt.slice(0, 140),
      payloadJson: JSON.stringify({
        body: prompt
          .replace(/^.*?(?:post\s*(?:saying|about|:)?)\s*/i, "")
          .slice(0, 280),
      }),
    };
  }

  return null;
}
