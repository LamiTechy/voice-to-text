import { Document, Packer, Paragraph, TextRun } from "docx";
import { segmentsToSrt, sanitizeFilename, withExtension } from "./formatters";

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadBlob(blob: Blob, filename: string): void {
  triggerDownload(blob, filename);
}

export function downloadText(
  text: string,
  filename: string,
  mime = "text/plain;charset=utf-8",
): void {
  triggerDownload(new Blob([text], { type: mime }), filename);
}

export async function downloadDocx(text: string, filename: string, title = "Transcript"): Promise<void> {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        new Paragraph({
          children: block
            .split(/\n/)
            .flatMap((line, index) => [
              new TextRun({ text: line, break: index === 0 ? 0 : 1 }),
            ]),
        }),
    );

  const document = new Document({
    title,
    sections: [
      {
        children: [
          new Paragraph({ children: [new TextRun({ text: title, bold: true, size: 28 })] }),
          ...paragraphs,
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(document);
  triggerDownload(blob, withExtension(sanitizeFilename(filename), "docx"));
}

export function downloadSrt(
  segments: Array<{ start: number; end: number; text: string }>,
  filename: string,
): void {
  downloadText(segmentsToSrt(segments), withExtension(sanitizeFilename(filename), "srt"));
}

export function downloadTranscriptTxt(text: string, filename: string): void {
  downloadText(text, withExtension(sanitizeFilename(filename), "txt"));
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  } catch {
    return false;
  }
}
