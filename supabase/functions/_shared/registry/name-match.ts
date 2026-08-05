const NAME_PARTICLES = new Set(["DA", "DAS", "DE", "DO", "DOS", "E"]);

export type NameMatchDecision =
  | "exact"
  | "fill_empty"
  | "auto_merge"
  | "review"
  | "provider_name_missing";

export interface NameMatchResult {
  decision: NameMatchDecision;
  similarity: number;
  token_overlap: number;
}

export function normalizePersonName(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^A-Za-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function meaningfulTokens(value: string): string[] {
  return normalizePersonName(value)
    .split(" ")
    .filter((token) => token && !NAME_PARTICLES.has(token));
}

function levenshteinDistance(left: string, right: string): number {
  if (!left) return right.length;
  if (!right) return left.length;
  const previous = Array.from(
    { length: right.length + 1 },
    (_, index) => index,
  );

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1]
        ? 0
        : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
}

function similarity(left: string, right: string): number {
  const maxLength = Math.max(left.length, right.length);
  if (maxLength === 0) return 1;
  return 1 - levenshteinDistance(left, right) / maxLength;
}

function tokenOverlap(left: string[], right: string[]): number {
  if (!left.length || !right.length) return 0;
  const rightSet = new Set(right);
  const intersection =
    new Set(left.filter((token) => rightSet.has(token))).size;
  return intersection / Math.min(new Set(left).size, rightSet.size);
}

export function decidePersonNameMatch(
  currentValue: unknown,
  providerValue: unknown,
): NameMatchResult {
  const current = normalizePersonName(currentValue);
  const provider = normalizePersonName(providerValue);
  if (!provider) {
    return {
      decision: "provider_name_missing",
      similarity: 0,
      token_overlap: 0,
    };
  }
  if (!current) {
    return { decision: "fill_empty", similarity: 0, token_overlap: 0 };
  }
  if (current === provider) {
    return { decision: "exact", similarity: 1, token_overlap: 1 };
  }

  const currentTokens = meaningfulTokens(current);
  const providerTokens = meaningfulTokens(provider);
  const score = similarity(current, provider);
  const overlap = tokenOverlap(currentTokens, providerTokens);
  const sameFirstName = currentTokens[0] === providerTokens[0];
  const sameLastName = currentTokens.length > 1 &&
    providerTokens.length > 1 &&
    currentTokens.at(-1) === providerTokens.at(-1);
  const enoughIdentityTokens =
    Math.min(currentTokens.length, providerTokens.length) >= 2;
  const highConfidence = sameFirstName &&
    enoughIdentityTokens &&
    (
      score >= 0.88 ||
      (sameLastName && overlap >= 0.75) ||
      overlap === 1
    );

  return {
    decision: highConfidence ? "auto_merge" : "review",
    similarity: Number(score.toFixed(4)),
    token_overlap: Number(overlap.toFixed(4)),
  };
}
