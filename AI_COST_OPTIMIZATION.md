# InSight AI API Cost Controls

This pipeline uses the OpenAI Responses API and the current `web_search` tool. Model and tool prices were verified against the official OpenAI model and pricing pages on July 19, 2026.

## Model selection

| Stage | Default | Official price per 1M tokens | Why |
| --- | --- | --- | --- |
| Classification and screenshot claim extraction | `gpt-5-nano` | $0.05 input, $0.005 cached input, $0.40 output | Cheapest current GPT model; structured outputs and image input are documented. No web search is used. |
| Normal grounded research | `gpt-5.4-nano` | $0.20 input, $0.02 cached input, $1.25 output | Cheapest model whose current official page explicitly documents Responses web search, structured outputs, and image input. |
| High-risk/complex research | `gpt-5.4-mini` | $0.75 input, $0.075 cached input, $4.50 output | Reserved for health, finance, legal, politics/elections, breaking news, conflict/war, or more than two factual claims. |

OpenAI lists web search at **$10 per 1,000 calls ($0.01 each)** plus search-content tokens billed at model rates. Tool cost dominates ordinary prompt-token cost, so skipping and caching searches is the primary margin control.

## Request pipeline

1. Normalize and validate the request. Free accounts are capped at 4,000 analysis characters and 3 MB screenshots; paid/admin accounts use the configured 8,000-character and 5 MB limits.
2. Reduce overlong text deterministically to up to ten factual-looking candidate sentences. No extra model call is used.
3. Hash normalized text, tracking-free URL, or screenshot bytes plus context. Reuse an unexpired exact cached result when available.
4. Run one no-search classification pass with `gpt-5-nano`. Opinion, joke, meme, satire, prediction, and vague content stop here.
5. For factual claims, run one grounded research pass. Normal claims use `gpt-5.4-nano` with low search context and at most two tool calls. High-risk/complex claims use `gpt-5.4-mini`, medium context, and at most three.
6. The deterministic trust engine accepts only URLs returned by the tool, ranks source quality, requires independent directional evidence, and computes verdicts/scores server-side.
7. If strict JSON validation fails, make one short no-tool repair request containing only the malformed JSON. Never repeat the full search request solely to repair JSON.

Screenshots are sent once, at low detail, during classification/claim extraction. The image is not resent during research. If the user supplies extracted text/context, that text is subject to the same plan limits.

## Cache policy

`fact_check_cache` stores only a SHA-256 content hash and validated result JSON. It stores no user ID, raw claim, submitted URL, or screenshot. RLS is enabled and all ordinary roles are revoked; only the service role can access it.

- Default/evergreen TTL: `FACT_CHECK_CACHE_TTL_HOURS` (168 hours by default).
- Politics, elections, health, finance, legal, breaking news, conflict/war, technology, and sports: at most 6 hours.
- Cache hits still create a private result for the requesting user and count against product usage, but make no OpenAI or web-search call.

## Output and retry limits

- Classification output: at most 1,200 tokens.
- Research output: `MAX_FACT_CHECK_OUTPUT_TOKENS`, 3,000 by default.
- Up to five classified claims and eight evidence entries per researched claim.
- One repair-only retry for malformed JSON. No blind full-pipeline retry.
- Total analysis deadline: 120 seconds.

## Cost estimates

Approximate fresh-check costs depend mainly on search calls:

- Opinion/satire/vague content: typically well under $0.001 (classification only).
- Exact cache hit: $0 in OpenAI cost.
- Normal fresh factual check: roughly $0.011-$0.023 for one or two searches plus tokens.
- High-risk fresh check: roughly $0.016-$0.036 depending on searches and output.

Compared with the prior implementation, this removes link-classification search, removes second full classification/research passes, avoids resending raw page/image context, reduces output ceilings by about 80%, and caps total searches to two or three. Expected savings are **40-80%** for fresh mixed traffic, **100%** on cache hits, and at least **$0.01 per link/opinion** that previously searched unnecessarily. Actual savings depend on the factual/search/cache mix and are visible in `/admin/ai`.

At official tool pricing, a hypothetical $4.99 plan with 1,000 fresh searched checks cannot be profitable: one search per check costs $10 before tokens. Such a plan requires a very high cache/non-factual rate, a separate search provider, or a materially higher price/lower quota. The current repository plans have much smaller quotas.

## Telemetry and admin controls

Each stage logs model, route, plan, input/output/cached tokens, estimated cost, search use, cache hit, truncation, latency, repair retry, and error state without raw input or source URLs. `/admin/ai` shows:

- total and daily estimated spend;
- cost per fact-check and per user;
- most expensive requests;
- cache hit and web-search rates;
- average input/output tokens;
- model usage/cost breakdown;
- retries, JSON repairs, timeouts, and search success.

## Environment variables

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-nano # legacy classifier fallback
OPENAI_DEFAULT_FACT_CHECK_MODEL=gpt-5.4-nano
OPENAI_CHEAP_CLASSIFIER_MODEL=gpt-5-nano
OPENAI_WEB_SEARCH_MODEL=gpt-5.4-nano
OPENAI_HIGH_RISK_MODEL=gpt-5.4-mini
ENABLE_WEB_SEARCH=true
ENABLE_MODEL_ROUTING=true
MAX_FACT_CHECK_INPUT_CHARS=8000
MAX_FACT_CHECK_OUTPUT_TOKENS=3000
FACT_CHECK_CACHE_TTL_HOURS=168
```

## Known tradeoffs and next steps

- No dedicated local OCR provider is installed. Low-detail vision performs screenshot text/claim extraction once. A proven OCR service can later replace that call for text-heavy screenshots.
- Exact hashing deliberately avoids semantic-cache false positives. A future embedding cache requires a reviewed similarity threshold and freshness policy.
- Cost estimates use the documented price table and should be updated when model/tool prices change.
- Evaluate model routing against a labeled political/health/finance set before lowering the high-risk model further.