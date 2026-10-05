export type DiffOpType = "equal" | "substitute" | "delete" | "insert";

export interface DiffOp {
  type: DiffOpType;
  ref?: string;
  hyp?: string;
}

export interface WerResult {
  /** Word error rate in the range 0..1 (0 = perfect match). */
  wer: number;
  /** Levenshtein edit distance in words. */
  distance: number;
  substitutions: number;
  deletions: number;
  insertions: number;
  hits: number;
  referenceTokens: number;
  hypothesisTokens: number;
  ops: DiffOp[];
}

const PUNCTUATION_RE = /[^\p{L}\p{N}\s']/gu;
const WHITESPACE_RE = /\s+/gu;

/** Lowercases, strips punctuation and collapses whitespace. */
export function normalizeText(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/\u0300-\u036f/gu, "")
    .toLowerCase()
    .replace(PUNCTUATION_RE, " ")
    .replace(WHITESPACE_RE, " ")
    .trim();
}

/** Splits normalized text into comparable word tokens. */
export function tokenize(input: string): string[] {
  const normalized = normalizeText(input);
  if (!normalized) return [];
  return normalized.split(" ");
}

function buildOps(reference: string[], hypothesis: string[]): DiffOp[] {
  const rows = reference.length;
  const cols = hypothesis.length;
  const dp: number[][] = Array.from({ length: rows + 1 }, () =>
    new Array<number>(cols + 1).fill(0),
  );

  for (let i = 0; i <= rows; i += 1) dp[i][0] = i;
  for (let j = 0; j <= cols; j += 1) dp[0][j] = j;

  for (let i = 1; i <= rows; i += 1) {
    for (let j = 1; j <= cols; j += 1) {
      const same = reference[i - 1] === hypothesis[j - 1];
      const cost = same ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j - 1] + cost,
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
      );
    }
  }

  const ops: DiffOp[] = [];
  let i = rows;
  let j = cols;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const same = reference[i - 1] === hypothesis[j - 1];
      const cost = same ? 0 : 1;
      if (dp[i][j] === dp[i - 1][j - 1] + cost) {
        ops.push(
          same
            ? { type: "equal", ref: reference[i - 1], hyp: hypothesis[j - 1] }
            : {
                type: "substitute",
                ref: reference[i - 1],
                hyp: hypothesis[j - 1],
              },
        );
        i -= 1;
        j -= 1;
        continue;
      }
    }
    if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      ops.push({ type: "delete", ref: reference[i - 1] });
      i -= 1;
      continue;
    }
    ops.push({ type: "insert", hyp: hypothesis[j - 1] });
    j -= 1;
  }

  return ops.reverse();
}

/**
 * Computes Word Error Rate between a reference and a hypothesis transcript.
 * WER = (S + D + I) / N, where N is the number of reference words.
 */
export function wordErrorRate(reference: string, hypothesis: string): WerResult {
  const refTokens = tokenize(reference);
  const hypTokens = tokenize(hypothesis);

  if (refTokens.length === 0) {
    return {
      wer: hypTokens.length === 0 ? 0 : 1,
      distance: hypTokens.length,
      substitutions: 0,
      deletions: 0,
      insertions: hypTokens.length,
      hits: 0,
      referenceTokens: 0,
      hypothesisTokens: hypTokens.length,
      ops:
        hypTokens.length === 0
          ? []
          : hypTokens.map((token) => ({ type: "insert" as const, hyp: token })),
    };
  }

  const ops = buildOps(refTokens, hypTokens);
  let substitutions = 0;
  let deletions = 0;
  let insertions = 0;
  let hits = 0;

  for (const op of ops) {
    if (op.type === "equal") hits += 1;
    else if (op.type === "substitute") substitutions += 1;
    else if (op.type === "delete") deletions += 1;
    else insertions += 1;
  }

  const distance = substitutions + deletions + insertions;
  const wer = distance / refTokens.length;

  return {
    wer,
    distance,
    substitutions,
    deletions,
    insertions,
    hits,
    referenceTokens: refTokens.length,
    hypothesisTokens: hypTokens.length,
    ops,
  };
}

/** True when both texts match exactly after normalization. */
export function textsMatch(reference: string, hypothesis: string): boolean {
  return normalizeText(reference) === normalizeText(hypothesis);
}
