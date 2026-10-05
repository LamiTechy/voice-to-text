import { describe, expect, it } from "vitest";
import {
  normalizeText,
  textsMatch,
  tokenize,
  wordErrorRate,
} from "@/lib/utils/wer";

describe("normalizeText", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeText("Hello, World!")).toBe("hello world");
  });

  it("collapses repeated whitespace", () => {
    expect(normalizeText("  a\n\n b\t c  ")).toBe("a b c");
  });

  it("keeps apostrophes inside words", () => {
    expect(normalizeText("Don't stop")).toBe("don't stop");
  });

  it("handles an empty string", () => {
    expect(normalizeText("")).toBe("");
  });
});

describe("tokenize", () => {
  it("splits normalized text into words", () => {
    expect(tokenize("One, two; three")).toEqual(["one", "two", "three"]);
  });

  it("returns an empty array for blank input", () => {
    expect(tokenize("   ")).toEqual([]);
  });
});

describe("wordErrorRate", () => {
  it("returns 0 for identical texts", () => {
    const result = wordErrorRate("the cat sat on the mat", "the cat sat on the mat");
    expect(result.wer).toBe(0);
    expect(result.distance).toBe(0);
    expect(result.hits).toBe(6);
    expect(result.ops.every((op) => op.type === "equal")).toBe(true);
  });

  it("is insensitive to case and punctuation", () => {
    const result = wordErrorRate("The cat sat.", "the cat sat!");
    expect(result.wer).toBe(0);
  });

  it("counts a single substitution", () => {
    const result = wordErrorRate("the cat sat", "the dog sat");
    expect(result.substitutions).toBe(1);
    expect(result.deletions).toBe(0);
    expect(result.insertions).toBe(0);
    expect(result.distance).toBe(1);
    expect(result.wer).toBeCloseTo(1 / 3, 5);
  });

  it("counts deletions (missing words)", () => {
    const result = wordErrorRate("one two three four", "one two");
    expect(result.deletions).toBe(2);
    expect(result.wer).toBeCloseTo(0.5, 5);
  });

  it("counts insertions (extra words)", () => {
    const result = wordErrorRate("one two", "one blue two green");
    expect(result.insertions).toBe(2);
    expect(result.wer).toBeCloseTo(1, 5);
  });

  it("handles mixed edits", () => {
    // reference: a b c d  / hypothesis: a x c d e
    // substitution (b->x), insertion (e)
    const result = wordErrorRate("a b c d", "a x c d e");
    expect(result.substitutions).toBe(1);
    expect(result.insertions).toBe(1);
    expect(result.deletions).toBe(0);
    expect(result.wer).toBeCloseTo(2 / 4, 5);
  });

  it("returns 1.0 when the reference is empty but hypothesis is not", () => {
    const result = wordErrorRate("", "something was said");
    expect(result.wer).toBe(1);
    expect(result.referenceTokens).toBe(0);
    expect(result.hypothesisTokens).toBe(3);
  });

  it("returns 0 when both texts are empty", () => {
    const result = wordErrorRate("", "");
    expect(result.wer).toBe(0);
    expect(result.ops).toHaveLength(0);
  });

  it("returns 1.0 when everything is deleted", () => {
    const result = wordErrorRate("alpha beta gamma", "");
    expect(result.wer).toBe(1);
    expect(result.deletions).toBe(3);
  });

  it("can exceed 1.0 with many insertions", () => {
    const result = wordErrorRate("hi", "hi there my friend");
    expect(result.insertions).toBe(3);
    expect(result.wer).toBeCloseTo(3, 5);
  });

  it("keeps the operation counts consistent with the tokens", () => {
    const reference = "the quick brown fox jumps over the lazy dog";
    const hypothesis = "the quick brown fox jump over lazy dogs now";
    const result = wordErrorRate(reference, hypothesis);

    expect(result.hits + result.substitutions + result.deletions).toBe(
      result.referenceTokens,
    );
    expect(result.hits + result.substitutions + result.insertions).toBe(
      result.hypothesisTokens,
    );
    expect(result.distance).toBe(
      result.substitutions + result.deletions + result.insertions,
    );
    expect(result.wer).toBeGreaterThan(0);
    expect(result.wer).toBeLessThan(1);
  });

  it("produces alignment ops in order", () => {
    const result = wordErrorRate("a b c", "a c");
    const types = result.ops.map((op) => op.type);
    expect(types).toEqual(["equal", "delete", "equal"]);
    expect(result.ops[1].ref).toBe("b");
    expect(result.ops[1].hyp).toBeUndefined();
  });
});

describe("textsMatch", () => {
  it("ignores formatting differences", () => {
    expect(textsMatch("Hello World!", "hello world")).toBe(true);
  });

  it("detects real differences", () => {
    expect(textsMatch("hello world", "hello worlds")).toBe(false);
  });
});
