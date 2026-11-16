# Free-Tier LLM Provider Benchmark for `Scrappy` (KSUX Campus AI Owl Assistant)

**Date Verified:** November 15, 2026  
**Issue:** [`Control707/KSUX#4`](https://github.com/Control707/KSUX/issues/4)  
**Scope:** Primary-source benchmark of $0-cost, no-billing-card LLM and embedding APIs to power `Scrappy` (`Ask Scrappy` chat view, `@scrappy` mentions in the `Feed`, and read-only tool calling across public KSUX modules: `Posts`, `Parking Lots` / `Parking Reports`, `Study Rooms` / `Study Sessions`, `Listings`, `Events`, `Clubs`, `Course Hubs`, `Shuttle Routes`, and dining across the `Kennesaw` and `Marietta` `Campuses`).

---

## Executive Decision Summary

1. **Primary Real-Time Chat & Tool-Calling Provider — Groq Cloud Free Plan (`openai/gpt-oss-120b` + `openai/gpt-oss-20b`):**
   - **Why:** True $0 tier with **no credit card required**, **500–1,000 tokens/sec** LPU inference for instant `@scrappy` `Feed` replies and `Judge Demo Mode` responsiveness, **Zero Data Retention (ZDR) eligibility / no model training by default**, explicit multi-end-user application rights, and **`30 RPM` / `1,000 RPD` / `8,000 TPM` / `200,000 TPD` per model** (`2,000 RPD` and `400,000 uncached TPD` combined across `gpt-oss-120b` + `gpt-oss-20b`, with cached prompt/tool-schema tokens exempt from rate limits).
   - **Critical 2026 Catalog Note:** Earlier Groq staples (`llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `meta-llama/llama-4-scout-17b-16e-instruct`, `meta-llama/llama-4-maverick-17b-128e-instruct`, and `qwen/qwen3-32b`) were retired from Groq's Free/Developer tiers between March and August 2026; target **`openai/gpt-oss-120b`** and **`openai/gpt-oss-20b`** (Production) or **`qwen/qwen3.8-27b`** (Preview).
2. **Primary Fallback LLM (Long-Context & 429 Overflow) — Google Gemini Developer API Free Tier (`gemini-3.5-flash-lite` + `gemini-4-hydrogen`):**
   - **Why:** $0 tier with **no credit card required**, **1,048,576-token context window**, native multi-tool calling + streaming Structured Outputs, and drop-in OpenAI SDK compatibility (`https://generativelanguage.googleapis.com/v1beta/openai/`). Automatically absorbs any `Scrappy` turn that exceeds Groq's `8,000 TPM` ceiling or hits a `429` rate limit.
   - **Critical 2026 Deprecation & Privacy Notes:** `gemini-2.5-pro` and `gemini-2.5-flash` are **deprecated** and auto-route to `gemini-3.8-flash` and `gemini-3.5-flash-lite` on **December 1, 2026** — do **not** target `2.5` model IDs in new code. On the Free Tier ("Unpaid Services"), Google **uses inputs and outputs for product/model improvement and human review**; `Scrappy` must never pass `Student` `.edu` emails, `Direct Messages (DMs)`, `Group Chats`, or `Deal Chats`, and must stick strictly to public KSUX module data.
3. **Primary Free Embeddings + Secondary ZDR Chat Fallback — Cloudflare Workers AI Free Tier (`10,000 Neurons/day`):**
   - **Why:** $0 tier with **no credit card required**, **Zero Data Retention + no model training**, **`3,000 RPM`** on embeddings, and **`300 RPM`** on text generation. A single `10,000 Neurons/day` free allowance covers **~9.3M tokens/day** on `@cf/baai/bge-m3` (`1,075` neurons/1M tokens) or **~64.9M tokens/day** on `@cf/google/embeddinggemma-2` (`154` neurons/1M tokens) — leaving >95% of daily Neurons available for `@cf/google/gemma-4-26b-a4b-it` or `@cf/openai/gpt-oss-20b` as a third-layer ZDR chat fallback. (`gemini-embedding-2` / `gemini-embedding-001` on Gemini Free Tier is a clean zero-cost alternative if consolidating onto two API keys.)
4. **Providers Disqualified or Deprioritized as Primary:**
   - **GitHub Models:** **Fully retired on July 30, 2026** — API, catalog, and playground no longer exist ([GitHub Docs](https://docs.github.com/en/github-models)).
   - **Cerebras Inference:** **Requires a verified payment method** to activate API keys and offers **no permanently free tier** — only a one-time **$5 / 30-day** non-production trial ([Cerebras Rate Limits](https://inference-docs.cerebras.ai/support/rate-limits)).
   - **OpenRouter (`:free` / `openrouter/free`):** Capped at **`20 RPM` and `50 RPD`** across the entire account when credit balance is $0 (`< 10` credits purchased all-time) — at >= 2 LLM calls per tool-assisted turn, `50 RPD` supports at most **25 `Scrappy` answers/day** campus-wide ([OpenRouter Limits](https://openrouter.ai/docs/api-reference/limits)). Keep only as an optional last-resort dev key.

---

## Side-by-Side Comparison Matrix ($0 Tier Without Billing Card)

| Provider | $0 Forever Tier? | Credit Card Gate? | Active Free Tool-Calling Models (Nov 2026) | Free Tier Rate Limits (RPM / RPD / TPM / TPD) | Tool Calling & Structured Output | Free Embeddings? | Data Retention & Training on $0 Tier | Multi-`Student` Campus App Allowed? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Groq Cloud** | **Yes** (Free Plan) | **No** | `openai/gpt-oss-120b` (Prod), `openai/gpt-oss-20b` (Prod), `qwen/qwen3.8-27b` (Preview) | **Per model:** `30 RPM` / `1,000 RPD` / `8,000 TPM` / `200,000 TPD` (cached tokens exempt) | OpenAI-compatible `tools`, parallel tool calls, `strict: true` JSON Schema (`tools` + `json_schema` cannot be combined in one call) | **No** | **Not retained by default; ZDR opt-in available; NO model training** | **Yes** (Groq Services Agreement §3.1 permits End Users via Customer Application; 18+ age terms) |
| **Google Gemini API (AI Studio)** | **Yes** (Free Tier) | **No** (QR mobile check on extra/imported GCP projects) | `gemini-4-hydrogen`, `gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite` (`2.5` deprecated) | Dynamic per-project in AI Studio (`gemini-decision-1` published at `200 RPM` / `10,000 RPD` / `50,000 TPM`; resets midnight PT) | Native + OpenAI-compatible `tools`, `validated` mode, streaming JSON Schema **with** tools on Gemini 3/4 | **Yes** (`gemini-embedding-2` & `gemini-embedding-001`, 128–3072 MRL dims, free) | **Used to train/improve Google models & human-reviewed** ("Unpaid Services"); Paid tier required in EEA/UK/CH | **Yes in US for 18+ `Students`** (prohibited for apps directed at <18 or EEA/UK/CH users on Unpaid tier) |
| **Cloudflare Workers AI** | **Yes** (Workers Free: `10,000 Neurons/day`) | **No** (9 frontier models gated; Llama/Qwen/Gemma/GPT-OSS/BGE free) | `@cf/google/gemma-4-26b-a4b-it`, `@cf/openai/gpt-oss-120b`, `@cf/openai/gpt-oss-20b`, `@cf/meta/llama-4-scout-17b-16e-instruct`, `@cf/qwen/qwen3.8-27b`, `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | **Text Gen:** `300 RPM`  <br>**Embeddings:** `3,000 RPM` (`1,500 RPM` `bge-large`)  <br>**Daily cap:** `10,000 Neurons/day` (resets `00:00 UTC`) | OpenAI-compatible `/v1/chat/completions` `tools` + `json_schema` JSON Mode (non-streaming) | **Yes** (`embeddinggemma-2`, `bge-m3`, `bge-small/base/large-en-v1.5`, `qwen3-embedding-0.6b`) | **Zero Data Retention (ZDR) & NO model training** | **Yes** (Cloudflare Self-Serve Subscription Agreement + third-party model licenses) |
| **OpenRouter** | **Yes** (`:free` variants & `openrouter/free`) | **No** | `openrouter/free` + 14 `:free` tool models (e.g., `google/gemma-4-31b-it:free`, `nvidia/nemotron-3.5-super-vl:free`) | **`20 RPM` / `50 RPD`** global across all `:free` models with `< 10` credits purchased (`1,000 RPD` only if >= 10 credits bought) | OpenAI-compatible `tools` & `structured_outputs` (`openrouter/free` auto-filters for tool support) | **Yes** (4 `:free` NVIDIA Nemotron embed models, sharing the `50 RPD` free pool) | OpenRouter does not train by default; upstream `:free` providers may log/train unless ZDR/opt-out filters are set | **Technically yes, practically unusable** (`50 RPD` = <= 25 tool-calling answers/day total) |
| **Cerebras Inference** | **No** ($5 credit expires in 30 days) | **Yes — Mandatory** (API inactive without verified payment method) | `qwen-3.8-27b` (`300 RPM` / `150K` uncached TPM), `gpt-oss-120b` (`5 RPM` / `30K` uncached TPM / `1M TPD`) | Trial capped at **$5 total / 30 days** | OpenAI-compatible `strict: true` constrained-decoding `tools`, parallel & multi-turn | **No** | Inputs/outputs not retained or trained on | **No on Trial** (Pricing footnote: *"not intended for production use"*; requires card) |
| **GitHub Models** | **No — RETIRED** | N/A | **None** (Shut down July 30, 2026) | **Retired** | **Retired** | **Retired** | N/A | **No — Service retired July 30, 2026** |

---

## Detailed Provider Findings (Primary Sources)

### 1. Groq Cloud Free Plan

**Primary Sources:**
- Rate Limits: [https://console.groq.com/docs/rate-limits](https://console.groq.com/docs/rate-limits)
- Supported Models & Pricing: [https://console.groq.com/docs/models](https://console.groq.com/docs/models)
- Deprecations History: [https://console.groq.com/docs/deprecations](https://console.groq.com/docs/deprecations)
- Tool Use & Local Tool Calling: [https://console.groq.com/docs/tool-use/overview](https://console.groq.com/docs/tool-use/overview), [https://console.groq.com/docs/tool-use/local-tool-calling](https://console.groq.com/docs/tool-use/local-tool-calling)
- Structured Outputs: [https://console.groq.com/docs/structured-outputs](https://console.groq.com/docs/structured-outputs)
- OpenAI Compatibility: [https://console.groq.com/docs/openai](https://console.groq.com/docs/openai)
- Billing FAQs: [https://console.groq.com/docs/billing-faqs](https://console.groq.com/docs/billing-faqs)
- Data Retention & ZDR: [https://console.groq.com/docs/your-data](https://console.groq.com/docs/your-data)
- Legal & Acceptable Use: [https://console.groq.com/docs/legal/services-agreement](https://console.groq.com/docs/legal/services-agreement), [https://console.groq.com/docs/legal/ai-policy](https://console.groq.com/docs/legal/ai-policy)

#### Credit-Card Gate & Signup
- **No credit card required** for the Free Plan ([Billing FAQs](https://console.groq.com/docs/billing-faqs): a payment method is only requested if upgrading to the pay-as-you-go Developer tier).

#### Exact Free Plan Quotas & 2026 Model Catalog Changes
Per [Groq Rate Limits](https://console.groq.com/docs/rate-limits) and [Groq Deprecations](https://console.groq.com/docs/deprecations), Groq retired `meta-llama/llama-4-maverick-17b-128e-instruct` (03/09/2026), `meta-llama/llama-4-scout-17b-16e-instruct` and `qwen/qwen3-32b` (07/17/2026), `llama-3.1-8b-instant` and `llama-3.3-70b-versatile` from Free/Developer plans (08/16/2026 — now Enterprise `ContactSales` only), `qwen/qwen3.6-27b` (09/14/2026), and `groq/compound` (09/21/2026).

The active Free Plan models and exact organization-level limits are:

| Model ID | Status | Speed | Context / Max Output | Free RPM | Free RPD | Free TPM | Free TPD |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `openai/gpt-oss-120b` | Production | ~500 tok/s | 131,072 / 65,536 | **30** | **1,000** | **8,000** | **200,000** |
| `openai/gpt-oss-20b` | Production | ~1,000 tok/s | 131,072 / 65,536 | **30** | **1,000** | **8,000** | **200,000** |
| `qwen/qwen3.8-27b` | Preview | ~450 tok/s | 131,072 / 16,384 | **30** | **1,000** | **8,000** | **200,000** |
| `meta-llama/llama-prompt-guard-2-22m` / `86m` | Preview (Safety) | — | 512 / 512 | **30** | **14,400** | **15,000** | **500,000** |
| `openai/gpt-oss-safeguard-20b` | Preview (Safety) | ~1,000 tok/s | 131,072 / 65,536 | **3** | **1,000** | **2,000** | **200,000** |
| `whisper-large-v3` / `whisper-large-v3-turbo` | Production (STT) | — | 100 MB | **20** | **2,000** | — | 7.2K ASH / 28.8K ASD |
| `canopylabs/orpheus-v1-english` | Preview (TTS) | — | 4,000 | **10** | **100** | **1,200** | **3,600** |

**Crucial Rate-Limit Mechanics:**
- **Cached tokens do NOT count toward rate limits** ([Rate Limits](https://console.groq.com/docs/rate-limits)). Keeping `Scrappy`'s system prompt and KSUX tool definitions static at the prefix of every request dramatically reduces effective TPM/TPD burn.
- Limits apply **per model** at the organization level. Routing complex `Ask Scrappy` multi-tool chats to `openai/gpt-oss-120b` and single-shot `@scrappy` `Feed` mentions to `openai/gpt-oss-20b` legitimately provides **`60 RPM`, `2,000 RPD`, and `400,000 uncached TPD`** across Production models (`3,000 RPD` / `600,000 TPD` if `qwen/qwen3.8-27b` is included). **Never** create multiple Groq accounts/organizations to bypass limits — [Groq's AUP](https://console.groq.com/docs/legal/ai-policy) explicitly forbids *"registering multiple accounts or orchestrating usage between multiple organizations."*
- Response headers expose live remaining quota on every call: `x-ratelimit-remaining-requests` (RPD), `x-ratelimit-remaining-tokens` (TPM), and `retry-after` on HTTP `429`.

#### Tool Calling, Structured Outputs & Embeddings
- **Tool Calling:** Full OpenAI-compatible local tool calling (`tools`, `tool_choice: "auto" | "none" | "required"`, `parallel_tool_calls: true`) via `https://api.groq.com/openai/v1/chat/completions` ([Local Tool Calling](https://console.groq.com/docs/tool-use/local-tool-calling)). Malformed JSON tool calls return HTTP `400` with `error.failed_generation`; Groq recommends `temperature` between `0.0` and `0.5` (note `temperature: 0` is internally mapped to `1e-8`) and keeping per-request tool count to 3–10 well-described tools.
- **Structured Outputs:** `strict: true` constrained decoding (`response_format: { type: "json_schema", json_schema: { strict: true, ... } }`) is supported on `openai/gpt-oss-20b`, `openai/gpt-oss-120b`, and `qwen/qwen3.8-27b`, **but cannot be combined with `tools` or `stream: true` in the same request** ([Structured Outputs](https://console.groq.com/docs/structured-outputs)).
- **Embeddings:** Not offered on GroqCloud.

#### Privacy, Training & Acceptable-Use Terms
- **Zero Data Retention & No Training:** Per [Your Data in GroqCloud](https://console.groq.com/docs/your-data) and [Groq Services Agreement §4.2](https://console.groq.com/docs/legal/services-agreement), **Groq does not retain inference inputs or outputs by default**, **never uses Customer Data to train or fine-tune models** without explicit customer instruction, and allows enabling full **Zero Data Retention (ZDR)** in `Settings → Data Controls` (which disables even 30-day abuse/reliability debugging logs).
- **Campus Deployment Eligibility:** Groq Services Agreement §3.1 explicitly grants Customers the right to integrate Groq APIs into a **Customer Application** and serve **End Users** (`Students` and `Judge Demo Mode` evaluators). Account holders must be 18+ (§2).

---

### 2. Google Gemini Developer API Free Tier (Google AI Studio)

**Primary Sources:**
- Rate Limits (redirects from `ai.google.dev/gemini-api/docs/rate-limits`): [https://aistudio.google.com/docs/rate-limits](https://aistudio.google.com/docs/rate-limits)
- Pricing (redirects from `ai.google.dev/pricing`): [https://aistudio.google.com/docs/pricing](https://aistudio.google.com/docs/pricing)
- Models & Deprecations: [https://aistudio.google.com/docs/models](https://aistudio.google.com/docs/models), [https://aistudio.google.com/docs/models/gemini-4-hydrogen](https://aistudio.google.com/docs/models/gemini-4-hydrogen), [https://aistudio.google.com/docs/models/gemini-3.5-flash-lite](https://aistudio.google.com/docs/models/gemini-3.5-flash-lite)
- Function Calling & Structured Outputs: [https://aistudio.google.com/docs/function-calling](https://aistudio.google.com/docs/function-calling), [https://aistudio.google.com/docs/structured-output](https://aistudio.google.com/docs/structured-output)
- Embeddings: [https://aistudio.google.com/docs/embeddings](https://aistudio.google.com/docs/embeddings)
- OpenAI Compatibility: [https://aistudio.google.com/docs/openai](https://aistudio.google.com/docs/openai)
- Project Verification & Billing: [https://aistudio.google.com/docs/verification](https://aistudio.google.com/docs/verification), [https://aistudio.google.com/docs/billing](https://aistudio.google.com/docs/billing), [https://aistudio.google.com/docs/api-key](https://aistudio.google.com/docs/api-key)
- Terms of Service (Effective March 23, 2026): [https://aistudio.google.com/docs/terms](https://aistudio.google.com/docs/terms)

#### Credit-Card Gate & Project Verification
- **No credit card or Cloud Billing account required** ([Billing](https://aistudio.google.com/docs/billing)). New Google AI Studio users automatically receive a default Google Cloud project and a service-account-bound Authorization API key on the **Free Tier**.
- **Anti-abuse QR check:** Secondary Google Cloud projects or projects created outside AI Studio may return `403 FREE_TIER_VERIFICATION_REQUIRED` until verified once via QR code on an iPhone (iOS 16.4+ App Clip) or Android phone — no phone number or billing card is collected ([Project Verification](https://aistudio.google.com/docs/verification)).

#### Active Free-Tier Models & Urgent December 1, 2026 Deprecation Warning
Per [Models](https://aistudio.google.com/docs/models) and [Pricing](https://aistudio.google.com/docs/pricing):
- **Do NOT use `gemini-2.5-pro` or `gemini-2.5-flash`:** Both are **deprecated**, already restricted from new AI Studio projects, and **on December 1, 2026**, `gemini-2.5-pro` automatically routes to `gemini-3.8-flash` while `gemini-2.5-flash` routes to `gemini-3.5-flash-lite`. `gemini-2.0-flash` and `gemini-2.0-flash-lite` are already shut down, and `gemini-2.5-flash-lite` is gated to prior users. Google explicitly advises: *"For any new projects, use our latest models: Gemini 4 Hydrogen or 3.5 Flash-Lite."*
- **Models available Free of Charge on the Gemini API Free Tier (Nov 2026):**
  - **`gemini-4-hydrogen`** (Stable): **Free of charge** (input, output including thinking tokens, and implicit context caching). **1,048,576-token unified context window**, 65,536 synchronous max output, multimodal inputs (text/image/audio/video/PDF), native Function Calling, and Structured Outputs.
  - **`gemini-3.8-flash`** & **`gemini-3.6-flash`** (Stable): **Free of charge** (input, output, and context caching) for agentic and software workflows.
  - **`gemini-3.5-flash-lite`** & **`gemini-3.1-flash-lite`** (Stable): **Free of charge** (input and output; 1,048,576 input / 65,536 output), purpose-built for low-latency, high-throughput agentic tool execution.
  - **`gemini-decision-1`** (Decisions API): **Free of charge** with explicitly published Free Tier quotas of **`200 RPM` / `50,000 TPM` / `10,000 RPD`** and zero output tokens — useful if `Scrappy` ever needs fast intent classification or moderation.
  - **`gemini-embedding-2`** (multimodal, 8,192 input tokens, auto-normalized MRL 128–3,072 dims) and **`gemini-embedding-001`** (text-only, 2,048 input tokens, MRL 128–3,072 dims): **Free of charge** on the Standard Free Tier.
- **Models NOT on the Free Tier:** `gemini-4-carbon`, `gemini-4-argon`, `gemini-3.1-pro-preview`, `gemini-omni-1.2-flash`, and native image-generation models (`Nano Banana` series) require a Paid Tier billing account (`$5` minimum Prepay). Built-in Grounding with Google Search / Google Maps is also disabled on the Free Tier for Gemini 3 and Gemini 4 models (custom Function Calling against KSUX's own database is unaffected).

#### Rate-Limit Structure
- Per [Rate Limits](https://aistudio.google.com/docs/rate-limits), Gemini enforces **RPM**, **TPM (input)**, and **RPD** at the **Google Cloud project level** (not per API key), with **RPD resetting at midnight Pacific Time**.
- Aside from `gemini-decision-1` (`200 RPM` / `50,000 TPM` / `10,000 RPD`), Google no longer hardcodes per-model interactive Free Tier RPM/RPD numbers in static Markdown docs; instead, active project quotas are dynamically assigned and inspected in [`https://aistudio.google.com/rate-limit`](https://aistudio.google.com/rate-limit), with `Flash-Lite` variants (`gemini-3.5-flash-lite`) carrying higher request throughput than heavier reasoning models. Exceeding any dimension returns `429 RESOURCE_EXHAUSTED`.

#### Tool Calling & OpenAI SDK Compatibility
- Supports both Google's native `@google/genai` SDK (`Interactions API`) and the **OpenAI SDK compatibility layer** (`baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"`) covering `/chat/completions` (`tools`, `tool_choice`, `reasoning_effort`, streaming, Pydantic/Zod `parse`) and `/embeddings` ([OpenAI Compatibility](https://aistudio.google.com/docs/openai)).
- Unlike Groq, Gemini 3 and Gemini 4 models support **combining Structured Outputs (`json_schema`), Function Calling, and streaming** in the same workflow ([Structured Outputs](https://aistudio.google.com/docs/structured-output)).

#### Data Privacy, Training & Acceptable-Use Terms
Per [Gemini API Additional Terms of Service](https://aistudio.google.com/docs/terms) (effective March 23, 2026):
- **Model Training & Human Review on Free Tier:** Under "Unpaid Services," **Google uses all submitted prompts, system instructions, cached content, and generated responses to provide, improve, and develop Google products and machine learning technologies**, and **human reviewers may read and annotate API inputs and outputs** (disconnected from the Google Account/API key). Google explicitly warns: **"Do not submit sensitive, confidential, or personal information to the Unpaid Services."**
- **Mandatory Guardrail for KSUX:** Because `Scrappy` only queries **public KSUX modules** (`Posts`, `Parking Reports`, `Study Rooms`, `Listings`, `Events`, `Clubs`, `Course Hubs`, `Shuttle Routes`, dining) and never touches private `Direct Messages (DMs)`, `Group Chats`, or `Deal Chats`, KSUX must strip `Student` account identifiers (such as `@students.kennesaw.edu` emails or internal auth IDs) from prompts before routing to Gemini's Free Tier.
- **Age & Geographic Restrictions:** Unpaid Services may **not** be used in API Clients directed toward or likely accessed by individuals **under 18**, and **Paid Services are mandatory** when serving users in the **EEA, Switzerland, or the UK**. For Kennesaw State University (`Kennesaw` and `Marietta` `Campuses` in Georgia, USA) serving adult university `Students` and hackathon judges (`Judge Demo Mode`), US regional rules apply.

---

### 3. Cloudflare Workers AI Free Tier

**Primary Sources:**
- Pricing & Neurons: [https://developers.cloudflare.com/workers-ai/platform/pricing/](https://developers.cloudflare.com/workers-ai/platform/pricing/) (updated Nov 12, 2026)
- Task Rate Limits: [https://developers.cloudflare.com/workers-ai/platform/limits/](https://developers.cloudflare.com/workers-ai/platform/limits/) (updated Sep 17, 2026)
- Data Usage & ZDR: [https://developers.cloudflare.com/workers-ai/platform/data-usage/](https://developers.cloudflare.com/workers-ai/platform/data-usage/) (updated Oct 16, 2026)
- OpenAI-Compatible Endpoints: [https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/](https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/)
- Function Calling & JSON Mode: [https://developers.cloudflare.com/workers-ai/features/function-calling/](https://developers.cloudflare.com/workers-ai/features/function-calling/), [https://developers.cloudflare.com/workers-ai/features/json-mode/](https://developers.cloudflare.com/workers-ai/features/json-mode/)
- Account Creation & Workers Free Plan: [https://developers.cloudflare.com/fundamentals/account/create-account/](https://developers.cloudflare.com/fundamentals/account/create-account/), [https://developers.cloudflare.com/workers/platform/pricing/](https://developers.cloudflare.com/workers/platform/pricing/)

#### Credit-Card Gate & Hard $0 Ceiling
- **No credit card required:** Creating a Cloudflare account (`Workers Free`) requires only email + password ([Create Account](https://developers.cloudflare.com/fundamentals/account/create-account/)).
- **Daily Free Allowance:** **`10,000 Neurons per day`** at $0, resetting daily at **`00:00 UTC`** ([Workers AI Pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)). On `Workers Free`, exceeding `10,000 Neurons/day` hard-fails with an error — **zero risk of accidental charges**.
- **Paid-Only Model Exceptions:** Nine frontier models (`@cf/moonshotai/kimi-k2.6`, `kimi-k2.7-code`, `@cf/zai-org/glm-5.2`, `glm-5.3`, `glm-5.3-flash`, `@cf/deepseek-ai/deepseek-v4*`, and `@cf/thinkingmachines/inkling-2-small`) require `Workers Paid` or prepaid AI Gateway credits. All other catalog models run on `Workers Free`.

#### Exact Rate Limits & `10,000 Neurons/day` Token Capacity
Per [Limits](https://developers.cloudflare.com/workers-ai/platform/limits/) and [Pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/):
- **Per-minute RPM:** **`300 RPM`** for Text Generation; **`3,000 RPM`** for Text Embeddings (`1,500 RPM` for `@cf/baai/bge-large-en-v1.5`).
- **Daily Token Math on `10,000 Neurons/day` (Free Tier):**

| Model ID | Role & Capabilities | Neuron Cost (per 1M tokens) | Daily Capacity on Free `10,000 Neurons` |
| :--- | :--- | :--- | :--- |
| `@cf/google/gemma-4-26b-a4b-it` | Chat + **Function calling** + Vision (256K ctx) | `9,091` in / `27,273` out | ~1.10M in **or** ~366K out (~250–350 `Scrappy` tool turns/day) |
| `@cf/openai/gpt-oss-20b` | Chat + **Function calling** + Reasoning (128K ctx) | `18,182` in / `27,273` out | ~550K in **or** ~366K out (~200–280 `Scrappy` tool turns/day) |
| `@cf/openai/gpt-oss-120b` | Chat + **Function calling** + Reasoning (128K ctx) | `31,818` in / `68,182` out | ~314K in **or** ~146K out (~100–140 `Scrappy` tool turns/day) |
| `@cf/meta/llama-4-scout-17b-16e-instruct` | Chat + **Function calling** + Vision (131K ctx) | `24,545` in / `77,273` out | ~407K in **or** ~129K out (~100–130 `Scrappy` tool turns/day) |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | Chat + **Function calling** + JSON Mode (24K ctx) | `26,668` in / `204,805` out | ~375K in **or** **~48.8K out** (~45–65 turns/day — Neuron-heavy) |
| `@cf/qwen/qwen3.8-27b` | Chat + **Function calling** + Vision (262K ctx) | `40,909` in / `290,909` out | ~244K in **or** **~34.4K out** (~35–50 turns/day — Neuron-heavy) |
| `@cf/ibm-granite/granite-4.0-h-micro` | Ultra-light **Function calling** | `1,542` in / `10,158` out | ~6.48M in **or** ~984K out (~1,000+ lightweight turns/day) |
| **`@cf/google/embeddinggemma-2`** | **768-dim multimodal embeddings** | **`154` in** | **~64.9 million tokens/day** |
| **`@cf/baai/bge-m3`** | **1024-dim multilingual/multi-granularity embeddings** | **`1,075` in** | **~9.30 million tokens/day** |
| **`@cf/qwen/qwen3-embedding-0.6b`** | **Text embeddings** | **`1,075` in** | **~9.30 million tokens/day** |
| **`@cf/baai/bge-small-en-v1.5`** | **384-dim English embeddings** | **`1,841` in** | **~5.43 million tokens/day** |
| **`@cf/baai/bge-base-en-v1.5`** | **768-dim English embeddings** | **`6,058` in** | **~1.65 million tokens/day** |

> **Deprecation Warning:** Do **not** use `@cf/qwen/qwen3-30b-a3b-fp8` — its model page lists a **Planned Deprecation date of November 20, 2026** ([qwen3-30b-a3b-fp8 docs](https://developers.cloudflare.com/workers-ai/models/qwen3-30b-a3b-fp8/)).

#### API Compatibility & Data Privacy
- **OpenAI SDK Drop-In:** `baseURL: "https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/v1"` supports both `/chat/completions` and `/embeddings` from any external backend (Vercel, Node/Bun, Supabase Edge Functions, or Cloudflare Workers) using a `Workers AI - Read/Edit` API token ([OpenAI Compatibility](https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/)).
- **Zero Data Retention & No Training:** Per [Data Usage](https://developers.cloudflare.com/workers-ai/platform/data-usage/), Cloudflare commits to **Zero Data Retention** for stateless inference requests and **never trains AI models on Customer Content** (even on the Free plan). Note: `Cloudflare Vectorize` itself requires the $5/mo `Workers Paid` plan ([Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/#vectorize)), so KSUX should store vectors in its primary Postgres/`pgvector` database while calling Workers AI `/v1/embeddings` for free vector generation.

---

### 4. Cerebras Inference

**Primary Sources:**
- Rate Limits & Free Trial FAQ: [https://inference-docs.cerebras.ai/support/rate-limits](https://inference-docs.cerebras.ai/support/rate-limits)
- Account & Billing: [https://inference-docs.cerebras.ai/console/account-billing](https://inference-docs.cerebras.ai/console/account-billing)
- Tool Calling & OpenAI Compatibility: [https://inference-docs.cerebras.ai/capabilities/tool-use](https://inference-docs.cerebras.ai/capabilities/tool-use), [https://inference-docs.cerebras.ai/resources/openai](https://inference-docs.cerebras.ai/resources/openai)
- Pricing & Privacy Policy: [https://www.cerebras.ai/pricing](https://www.cerebras.ai/pricing), [https://www.cerebras.ai/privacy-policy](https://www.cerebras.ai/privacy-policy)

#### Why Disqualified for KSUX's $0 No-Card Requirement
1. **Mandatory Payment Method Gate:** Per [Rate Limits FAQ](https://inference-docs.cerebras.ai/support/rate-limits): *"New accounts receive $5 in free credits after adding a verified payment method... If you skip adding a payment method at sign-up, Playground and API access remain inactive until you do."*
2. **No Permanently Free Tier:** Per the same FAQ: *"Is there a permanently free tier? No. The Free Trial is time- and credit-bounded: $5 in credits that expire 30 days after they're granted. Once your credits are used up or expire, you need to purchase credits (Pay as You Go) to keep using Shared Inference."*
3. **Non-Production Trial Restriction:** [Cerebras Pricing](https://www.cerebras.ai/pricing) marks the Free Trial tier as *"For development, evaluation, and experimentation; not intended for production use."*
4. **Technical Capabilities (for reference):** Shared Inference exposes `qwen-3.8-27b` (`300 RPM`, `150K` uncached TPM, `750K` total TPM) and `gpt-oss-120b` (`5 RPM` on Trial, `30K` uncached TPM, `1M TPD`), with `strict: true` constrained-decoding tool calling, zero input/output retention, and no embedding models.

---

### 5. OpenRouter Free Models (`:free` & `openrouter/free`)

**Primary Sources:**
- API Credit & Rate Limits: [https://openrouter.ai/docs/api-reference/limits](https://openrouter.ai/docs/api-reference/limits)
- Free Variant & Free Models Router: [https://openrouter.ai/docs/guides/routing/model-variants/free](https://openrouter.ai/docs/guides/routing/model-variants/free), [https://openrouter.ai/docs/guides/routing/routers/free-router](https://openrouter.ai/docs/guides/routing/routers/free-router)
- Embeddings & Privacy: [https://openrouter.ai/docs/api-reference/embeddings](https://openrouter.ai/docs/api-reference/embeddings), [https://openrouter.ai/docs/guides/privacy/data-collection](https://openrouter.ai/docs/guides/privacy/data-collection), [https://openrouter.ai/docs/guides/privacy/provider-logging](https://openrouter.ai/docs/guides/privacy/provider-logging)
- Live Model Catalogs: `https://openrouter.ai/api/v1/models`, `https://openrouter.ai/api/v1/embeddings/models`

#### Exact Rate-Limit Math ($0 Account)
Per [OpenRouter Limits](https://openrouter.ai/docs/api-reference/limits), accounts using `:free` model variants (or `openrouter/free`) are governed by lifetime credits purchased:

| Credits Purchased (All Time) | `:free` Requests per Minute (RPM) | `:free` Requests per UTC Day (RPD) |
| :--- | :--- | :--- |
| **Less than 10 credits ($0 balance)** | **`20 RPM`** | **`50 RPD`** |
| At least 10 credits (~$10 one-time) | `20 RPM` | `1,000 RPD` |

- **Why Unusable as Primary:** `50 RPD` is enforced globally across the account (creating extra keys or accounts does not increase capacity). Every tool-calling interaction in `Ask Scrappy` or `@scrappy` consumes **at least 2 API requests** (tool selection -> tool result synthesis), capping an entire KSUX deployment at **<= 25 tool-assisted answers per UTC day** on a $0 account.
- **Catalog & Privacy Notes:** Live catalog inspection (`GET /api/v1/models` on Nov 15, 2026) shows 14 `:free` chat models supporting `tools` (e.g., `google/gemma-4-31b-it:free`, `google/gemma-4-26b-a4b-it:free`, `nvidia/nemotron-3.5-super-vl:free`, `inclusionai/ling-3.2-flash:free`) plus `openrouter/free` (which auto-selects a `:free` model supporting the request's required parameters like `tools`), and 4 `:free` NVIDIA Nemotron embedding models (`nvidia/nemotron-3.5-embed-1b:free`, `nvidia/nemotron-3.5-embed-8b:free`, `nvidia/nemotron-3-embed-1b:free`, `nvidia/llama-nemotron-embed-vl-1b-v2:free`). Upstream `:free` providers frequently log or train on prompts unless `provider.data_collection: "deny"` is set, which further restricts available endpoints.

---

### 6. GitHub Models

**Primary Source:**
- Official Retirement Notice: [https://docs.github.com/en/github-models](https://docs.github.com/en/github-models)

#### Status: Fully Retired (Do Not Use)
Official GitHub documentation states verbatim:
> *"GitHub Models has been retired. As of July 30, 2026, GitHub Models has been fully retired. The playground, model catalog, inference API, and bring your own key (BYOK) are no longer available to any customer."*

*(Even prior to its July 2026 shutdown, GitHub Models restricted usage to prototyping and forbade production multi-user application hosting, directing production workloads to paid Azure AI Foundry.)*

---

## Recommended Architecture for `Scrappy`

All three recommended $0 no-card providers expose **OpenAI-compatible `/chat/completions` and `/embeddings` endpoints**, allowing KSUX to implement a clean, single-interface provider router (via the `openai` TypeScript SDK or Vercel AI SDK) with automatic failover on HTTP `429` / `5xx` or token-budget thresholds:

### 1. Chat, `@scrappy` Mentions & Tool Calling Over Public KSUX Modules
- **Tier 1A — `@scrappy` Mentions in the `Feed` (Primary):**
  - **Provider / Model:** **Groq Cloud Free Plan — `openai/gpt-oss-20b`** (`https://api.groq.com/openai/v1`)
  - **Why:** ~1,000 tok/s sub-second latency, `30 RPM` / `1,000 RPD` / `8,000 TPM` / `200,000 TPD` dedicated bucket, ZDR-eligible, zero training.
- **Tier 1B — `Ask Scrappy` Multi-Tool Chat View (Primary):**
  - **Provider / Model:** **Groq Cloud Free Plan — `openai/gpt-oss-120b`** (`https://api.groq.com/openai/v1`)
  - **Why:** Stronger 120B multi-step tool reasoning across KSUX tools (`search_posts`, `get_parking_reports`, `get_study_rooms`, `search_listings`, `get_events`, `get_clubs`, `get_course_hubs`, `get_shuttle_routes`, `get_dining`), ~500 tok/s speed, `parallel_tool_calls: true`, and its own independent `30 RPM` / `1,000 RPD` / `8,000 TPM` / `200,000 TPD` quota bucket.
  - **Implementation Guardrail for Groq's `8,000 TPM` Cap:** Keep static system instructions + tool schemas identical at the prompt prefix (cached tokens do **not** count toward Groq rate limits), cap tool query results to top `5–10` compact JSON rows per tool call, and route any conversation exceeding ~4,500 uncached input tokens directly to Tier 2.
- **Tier 2 — Long-Context & `429` Overflow Fallback:**
  - **Provider / Model:** **Google Gemini API Free Tier — `gemini-3.5-flash-lite`** (fast tool loops) / **`gemini-4-hydrogen`** (deep reasoning or large context) via `https://generativelanguage.googleapis.com/v1beta/openai/`
  - **Guardrail:** Strip `Student` `.edu` email addresses and internal `Student` IDs from request payloads, and enforce `Scrappy`'s architectural boundary (public KSUX tables only — never `Direct Messages (DMs)`, `Group Chats`, or `Deal Chats`) so no personal/confidential data touches Google's Unpaid Services pipeline.
- **Tier 3 — Zero-Data-Retention Emergency Fallback:**
  - **Provider / Model:** **Cloudflare Workers AI Free Tier — `@cf/google/gemma-4-26b-a4b-it` or `@cf/openai/gpt-oss-20b`** (`https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/v1`, `300 RPM`, ~200–350 turns/day inside `10,000 Neurons/day`, ZDR + no training).

### 2. Semantic Search / Vector Embeddings (Alongside Structured SQL Tool Queries)
- **Primary Recommendation:** **Cloudflare Workers AI Free Tier — `@cf/baai/bge-m3` (1,024 dims) or `@cf/google/embeddinggemma-2` (768 dims)** via `/v1/embeddings`.
  - **Why:** `3,000 RPM`, **Zero Data Retention + no training on `Student` `Posts` or `Listings`**, no credit card, and `10,000 Neurons/day` embeds **9.3M–64.9M tokens/day** (consuming <2% of daily Neurons for typical campus `Post` / `Listing` / `Event` / `Club` indexing while storing vectors in KSUX's own Postgres/`pgvector` tables).
- **Alternative (Fewer Vendor Keys):** **Google Gemini API Free Tier — `gemini-embedding-2` or `gemini-embedding-001`** (`output_dimensionality: 768`), free of charge via `/v1beta/openai/embeddings`, subject to Gemini Free Tier data-improvement terms on public text.
