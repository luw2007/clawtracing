export interface ModelTokenPricingUsd {
  input_per_million_tokens_usd: number;
  output_per_million_tokens_usd: number;
}

const MODEL_PRICING_USD: Record<string, ModelTokenPricingUsd> = {
  "gpt-4o": { input_per_million_tokens_usd: 5, output_per_million_tokens_usd: 15 },
  "gpt-4o-mini": { input_per_million_tokens_usd: 0.15, output_per_million_tokens_usd: 0.6 },
  "gpt-4.1": { input_per_million_tokens_usd: 5, output_per_million_tokens_usd: 15 },
  "gpt-4.1-mini": { input_per_million_tokens_usd: 0.3, output_per_million_tokens_usd: 1.2 },
  "gpt-4.1-nano": { input_per_million_tokens_usd: 0.1, output_per_million_tokens_usd: 0.4 },
  "o1": { input_per_million_tokens_usd: 15, output_per_million_tokens_usd: 60 },
  "o1-mini": { input_per_million_tokens_usd: 3, output_per_million_tokens_usd: 12 },
  "claude-3-5-sonnet": { input_per_million_tokens_usd: 3, output_per_million_tokens_usd: 15 },
  "claude-3-5-haiku": { input_per_million_tokens_usd: 1, output_per_million_tokens_usd: 5 },
  "claude-3-opus": { input_per_million_tokens_usd: 15, output_per_million_tokens_usd: 75 },
  "claude-3-sonnet": { input_per_million_tokens_usd: 3, output_per_million_tokens_usd: 15 },
  "claude-3-haiku": { input_per_million_tokens_usd: 0.25, output_per_million_tokens_usd: 1.25 },
};

function normalizeModelName(model: string): string {
  return model.trim().toLowerCase();
}

export function resolveModelTokenPricingUsd(model: string): ModelTokenPricingUsd | null {
  const normalized = normalizeModelName(model);
  const exact = MODEL_PRICING_USD[normalized];
  if (exact) return exact;

  const keys = Object.keys(MODEL_PRICING_USD).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (normalized === key || normalized.startsWith(`${key}-`)) {
      return MODEL_PRICING_USD[key] ?? null;
    }
  }

  return null;
}

export function estimateCostUsdFromUsage(input: {
  model?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
}): number {
  const model = typeof input.model === "string" && input.model.length > 0 ? input.model : null;
  if (!model) return 0;

  const pricing = resolveModelTokenPricingUsd(model);
  if (!pricing) return 0;

  const inTokensRaw = typeof input.input_tokens === "number" ? input.input_tokens : 0;
  const outTokensRaw = typeof input.output_tokens === "number" ? input.output_tokens : 0;

  const inputTokens = Number.isFinite(inTokensRaw) ? Math.max(0, inTokensRaw) : 0;
  const outputTokens = Number.isFinite(outTokensRaw) ? Math.max(0, outTokensRaw) : 0;

  const inputUsd = (inputTokens / 1_000_000) * pricing.input_per_million_tokens_usd;
  const outputUsd = (outputTokens / 1_000_000) * pricing.output_per_million_tokens_usd;
  const total = inputUsd + outputUsd;

  return Number.isFinite(total) ? total : 0;
}
