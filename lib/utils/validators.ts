import { z } from "zod";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const LANGUAGE_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;
export const VOICE_RE = /^[a-zA-Z0-9 _.\-()]{1,120}$/;

export const MAX_TTS_CHARS = 5000;
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const ALLOWED_AUDIO_EXTENSIONS = ["mp3", "wav", "m4a", "webm", "ogg"] as const;
export const ALLOWED_AUDIO_MIME_PREFIXES = ["audio/", "video/webm", "application/ogg"];

export const emailSchema = z
  .string()
  .trim()
  .min(3, "Email is required")
  .max(255, "Email is too long")
  .refine((value) => EMAIL_RE.test(value), { message: "Enter a valid email address" })
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters")
  .refine((value) => /[a-zA-Z]/.test(value), {
    message: "Password must contain at least one letter",
  })
  .refine((value) => /[0-9]/.test(value), {
    message: "Password must contain at least one number",
  });

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(80, "Name must be at most 80 characters"),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required").max(128),
});

export const ttsSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Text is required")
    .max(MAX_TTS_CHARS, `Text must be at most ${MAX_TTS_CHARS} characters`),
  voice: z
    .string()
    .trim()
    .regex(VOICE_RE, "Unsupported voice name")
    .nullish(),
  rate: z
    .number()
    .min(0.5, "Speed must be at least 0.5x")
    .max(2, "Speed must be at most 2x")
    .default(1),
  pitch: z
    .number()
    .min(0, "Pitch must be at least 0")
    .max(2, "Pitch must be at most 2")
    .default(1),
  volume: z
    .number()
    .min(0, "Volume must be at least 0")
    .max(1, "Volume must be at most 1")
    .default(1),
  format: z.enum(["mp3", "wav"]).default("mp3"),
});

export const sttMetaSchema = z.object({
  language: z
    .string()
    .trim()
    .regex(LANGUAGE_RE, "Unsupported language code")
    .nullish(),
  includeTimestamps: z.coerce.boolean().default(true),
});

export const historySchema = z.object({
  type: z.enum(["tts", "stt"]),
  input_text: z.string().max(20000, "Input text is too long").default(""),
  output_text: z.string().max(120000, "Output text is too long").default(""),
  language: z.string().trim().regex(LANGUAGE_RE, "Unsupported language code").default("en"),
  voice: z.string().trim().regex(VOICE_RE, "Unsupported voice name").nullish(),
  duration_seconds: z
    .number()
    .int()
    .min(0)
    .max(6 * 60 * 60)
    .nullish(),
  settings: z.record(z.string(), z.unknown()).default({}),
});

export const historyDeleteSchema = z.object({
  id: z.string().uuid("Invalid conversion id"),
});

export const historyListSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  type: z.enum(["tts", "stt"]).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type TtsInput = z.infer<typeof ttsSchema>;
export type HistoryInput = z.infer<typeof historySchema>;

export interface FieldIssue {
  path: string;
  message: string;
}

export function collectIssues(error: z.ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input";
}
