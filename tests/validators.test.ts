import { describe, expect, it } from "vitest";
import {
  MAX_TTS_CHARS,
  collectIssues,
  firstIssueMessage,
  historyDeleteSchema,
  historySchema,
  loginSchema,
  registerSchema,
  ttsSchema,
} from "@/lib/utils/validators";

describe("registerSchema", () => {
  const valid = { name: "Ada Lovelace", email: "Ada@Example.com", password: "Secret123" };

  it("accepts a valid registration", () => {
    const result = registerSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("ada@example.com");
  });

  it("rejects a name shorter than 2 characters", () => {
    const result = registerSchema.safeParse({ ...valid, name: "A" });
    expect(result.success).toBe(false);
    if (!result.success) expect(firstIssueMessage(result.error)).toMatch(/at least 2/i);
  });

  it("rejects an invalid email", () => {
    const result = registerSchema.safeParse({ ...valid, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects a password without a number", () => {
    const result = registerSchema.safeParse({ ...valid, password: "LettersOnly" });
    expect(result.success).toBe(false);
    if (!result.success) expect(firstIssueMessage(result.error)).toMatch(/number/i);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = registerSchema.safeParse({ ...valid, password: "Ab1" });
    expect(result.success).toBe(false);
  });

  it("reports field-level issues", () => {
    const result = registerSchema.safeParse({ name: "A", email: "bad", password: "short" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = collectIssues(result.error);
      expect(issues.length).toBeGreaterThanOrEqual(3);
      expect(issues.map((issue) => issue.path)).toContain("email");
    }
  });
});

describe("loginSchema", () => {
  it("accepts valid credentials", () => {
    expect(
      loginSchema.safeParse({ email: "user@example.com", password: "whatever" }).success,
    ).toBe(true);
  });

  it("requires a password", () => {
    expect(loginSchema.safeParse({ email: "user@example.com", password: "" }).success).toBe(false);
  });

  it("rejects malformed emails", () => {
    expect(loginSchema.safeParse({ email: "user@@example", password: "abc" }).success).toBe(false);
  });
});

describe("ttsSchema", () => {
  it("applies defaults for optional controls", () => {
    const result = ttsSchema.safeParse({ text: "hello world" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rate).toBe(1);
      expect(result.data.pitch).toBe(1);
      expect(result.data.volume).toBe(1);
      expect(result.data.format).toBe("mp3");
    }
  });

  it(`accepts up to ${MAX_TTS_CHARS} characters`, () => {
    const text = "a".repeat(MAX_TTS_CHARS);
    expect(ttsSchema.safeParse({ text }).success).toBe(true);
  });

  it("rejects text beyond the character limit", () => {
    const text = "a".repeat(MAX_TTS_CHARS + 1);
    const result = ttsSchema.safeParse({ text });
    expect(result.success).toBe(false);
    if (!result.success) expect(firstIssueMessage(result.error)).toMatch(/at most/i);
  });

  it("rejects blank text", () => {
    expect(ttsSchema.safeParse({ text: "   " }).success).toBe(false);
  });

  it("rejects a speed below 0.5 or above 2", () => {
    expect(ttsSchema.safeParse({ text: "hi", rate: 0.4 }).success).toBe(false);
    expect(ttsSchema.safeParse({ text: "hi", rate: 2.1 }).success).toBe(false);
    expect(ttsSchema.safeParse({ text: "hi", rate: 0.5 }).success).toBe(true);
    expect(ttsSchema.safeParse({ text: "hi", rate: 2 }).success).toBe(true);
  });

  it("rejects an unsupported audio format", () => {
    expect(ttsSchema.safeParse({ text: "hi", format: "flac" }).success).toBe(false);
  });

  it("rejects unsafe voice names", () => {
    expect(ttsSchema.safeParse({ text: "hi", voice: "../../etc/passwd" }).success).toBe(false);
  });
});

describe("historySchema", () => {
  it("accepts a minimal TTS record", () => {
    const result = historySchema.safeParse({ type: "tts", input_text: "hello" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.language).toBe("en");
      expect(result.data.output_text).toBe("");
    }
  });

  it("rejects an unknown conversion type", () => {
    expect(historySchema.safeParse({ type: "tts2", input_text: "x" }).success).toBe(false);
  });

  it("rejects an invalid language tag", () => {
    expect(
      historySchema.safeParse({ type: "stt", language: "<script>" }).success,
    ).toBe(false);
  });

  it("rejects an oversized output", () => {
    const result = historySchema.safeParse({
      type: "stt",
      output_text: "x".repeat(120_001),
    });
    expect(result.success).toBe(false);
  });
});

describe("historyDeleteSchema", () => {
  it("accepts a uuid", () => {
    expect(
      historyDeleteSchema.safeParse({ id: "6f9619ff-8b86-4d01-b42d-00cf4fc964ff" }).success,
    ).toBe(true);
  });

  it("rejects a non-uuid id", () => {
    expect(historyDeleteSchema.safeParse({ id: "123" }).success).toBe(false);
  });
});
