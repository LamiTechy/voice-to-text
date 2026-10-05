import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/utils/errors";
import {
  detectNonAudioFormat,
  extensionOf,
  sniffAudioFormat,
  validateAudioFile,
} from "@/lib/utils/audio";
import { MAX_UPLOAD_BYTES } from "@/lib/utils/validators";

const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const id3Bytes = new Uint8Array([
  0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);
const rawFrameBytes = new Uint8Array([
  0xff, 0xfb, 0x90, 0x44, 0x00, 0x0f, 0xf0, 0x00, 0x00, 0x00, 0x00, 0x00,
]);
const wavBytes = new Uint8Array(16);
wavBytes.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
wavBytes.set([0x57, 0x41, 0x56, 0x45], 8); // WAVE
const oggBytes = new Uint8Array(16);
oggBytes.set([0x4f, 0x67, 0x67, 0x53], 0); // OggS
const m4aBytes = new Uint8Array(16);
m4aBytes.set([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70], 0); // ....ftyp
const webmBytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1f]);
const jsonBytes = new TextEncoder().encode('{"error":"not audio"}');

function file(bytes: Uint8Array | string, name: string): File {
  const data =
    typeof bytes === "string"
      ? new TextEncoder().encode(bytes)
      : new Uint8Array(bytes);
  return new File([data], name, { type: "application/octet-stream" });
}

async function expectRejection(promise: Promise<unknown>, status: number, message: RegExp) {
  await expect(promise).rejects.toMatchObject({ name: "ApiError", status });
  await promise.catch((error: unknown) => {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toMatch(message);
  });
}

describe("extensionOf", () => {
  it("lower-cases the final extension", () => {
    expect(extensionOf("Voice.MP3")).toBe("mp3");
  });

  it("returns an empty string when there is no dot", () => {
    expect(extensionOf("recording")).toBe("");
  });
});

describe("detectNonAudioFormat", () => {
  it("identifies PNG images", () => {
    expect(detectNonAudioFormat(pngBytes)).toBe("PNG image");
  });

  it("identifies JPEG images", () => {
    expect(detectNonAudioFormat(jpegBytes)).toBe("JPEG image");
  });

  it("does not flag audio headers", () => {
    expect(detectNonAudioFormat(rawFrameBytes)).toBeNull();
    expect(detectNonAudioFormat(wavBytes)).toBeNull();
  });

  it("returns null for buffers shorter than 8 bytes", () => {
    expect(detectNonAudioFormat(new Uint8Array([0x89, 0x50]))).toBeNull();
  });
});

describe("sniffAudioFormat", () => {
  it("detects MP3 with an ID3 tag", () => {
    expect(sniffAudioFormat(id3Bytes)).toBe("mp3");
  });

  it("detects raw MP3 frame syncs (0xFF 0xFB)", () => {
    expect(sniffAudioFormat(rawFrameBytes)).toBe("mp3");
  });

  it("detects WAV", () => {
    expect(sniffAudioFormat(wavBytes)).toBe("wav");
  });

  it("detects OGG", () => {
    expect(sniffAudioFormat(oggBytes)).toBe("ogg");
  });

  it("detects M4A", () => {
    expect(sniffAudioFormat(m4aBytes)).toBe("m4a");
  });

  it("detects WebM", () => {
    expect(sniffAudioFormat(webmBytes)).toBe("webm");
  });

  it("returns null for non-audio content", () => {
    expect(sniffAudioFormat(jsonBytes)).toBeNull();
  });
});

describe("validateAudioFile", () => {
  it("accepts a genuine MP3", async () => {
    await expect(validateAudioFile(file(rawFrameBytes, "voice.mp3"))).resolves.toBe("mp3");
  });

  it("accepts a genuine WAV", async () => {
    await expect(validateAudioFile(file(wavBytes, "clip.wav"))).resolves.toBe("wav");
  });

  it("rejects an empty file", async () => {
    await expectRejection(validateAudioFile(file(new Uint8Array(0), "empty.mp3")), 422, /empty/i);
  });

  it("rejects files above the 25 MB limit", async () => {
    const big = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "huge.mp3");
    await expectRejection(validateAudioFile(big), 413, /25 MB/i);
  });

  it("rejects extensions outside the allow-list", async () => {
    await expectRejection(validateAudioFile(file(pngBytes, "notes.txt")), 415, /Unsupported file type/i);
  });

  it("rejects files without an extension", async () => {
    await expectRejection(validateAudioFile(file(pngBytes, "recording")), 415, /Unsupported file type/i);
  });

  it("rejects a PNG renamed to .mp3 with an image-specific message", async () => {
    await expectRejection(validateAudioFile(file(pngBytes, "photo.mp3")), 415, /PNG image.*not an audio/i);
  });

  it("rejects a PDF renamed to .wav", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.7\n");
    await expectRejection(validateAudioFile(file(pdf, "doc.wav")), 415, /PDF document.*not an audio/i);
  });

  it("rejects audio whose contents do not match the extension", async () => {
    await expectRejection(validateAudioFile(file(wavBytes, "clip.mp3")), 415, /do not match/i);
  });

  it("rejects content that is not audio at all", async () => {
    await expectRejection(validateAudioFile(file(jsonBytes, "payload.mp3")), 415, /do not look like/i);
  });
});
