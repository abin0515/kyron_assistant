export type ModelPrice = {
  id: string;
  inputUsdPerMillion: number;
  cachedInputUsdPerMillion: number;
  outputUsdPerMillion: number;
};

export type TokenCounts = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
};

// Reasoning tokens are billed as output tokens and are already included in
// outputTokens. Returns null when the model has no price, so unknown cost is
// never shown as $0.
export function estimateCostUsd(tokens: TokenCounts, price: ModelPrice | null): number | null {
  if (!price) {
    return null;
  }

  const cached = Math.min(tokens.cachedInputTokens, tokens.inputTokens);
  const uncachedInput = tokens.inputTokens - cached;

  return (
    (uncachedInput * price.inputUsdPerMillion +
      cached * price.cachedInputUsdPerMillion +
      tokens.outputTokens * price.outputUsdPerMillion) /
    1_000_000
  );
}
