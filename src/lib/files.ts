/**
 * Local file import helpers. Files are read with the browser File API only —
 * they are never uploaded anywhere. Type and size are restricted before reading.
 */

export const ACCEPTED_IMPORT_TYPES = '.txt,.md,text/plain,text/markdown';
/** Hard byte cap for imported files (25 MB) — larger files fail safely. */
export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

export type FileImportResult =
  | { ok: true; text: string; name: string }
  | { ok: false; reason: 'type' | 'size' | 'read' | 'empty'; detail: string };

export function validateImportFile(file: File): { ok: boolean; reason?: FileImportFailedReason } {
  const nameLower = file.name.toLowerCase();
  const typeOk =
    nameLower.endsWith('.txt') ||
    nameLower.endsWith('.md') ||
    file.type === 'text/plain' ||
    file.type === 'text/markdown';
  if (!typeOk) return { ok: false, reason: 'type' };
  if (file.size > MAX_IMPORT_BYTES) return { ok: false, reason: 'size' };
  return { ok: true };
}

type FileImportFailedReason = 'type' | 'size' | 'read' | 'empty';

export function readFileAsText(file: File): Promise<FileImportResult> {
  const validation = validateImportFile(file);
  if (!validation.ok) {
    const reason = validation.reason as FileImportFailedReason;
    return Promise.resolve({
      ok: false as const,
      reason,
      detail:
        reason === 'type'
          ? 'Only plain-text files (.txt, .md) can be imported. Executable and binary files are rejected.'
          : 'The file exceeds the 25 MB import limit.',
    });
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (): void => {
      const result = reader.result;
      if (typeof result !== 'string') {
        resolve({ ok: false, reason: 'read', detail: 'The file could not be read as text.' });
        return;
      }
      if (result.length === 0) {
        resolve({ ok: false, reason: 'empty', detail: 'The file is empty.' });
        return;
      }
      resolve({ ok: true, text: result, name: file.name });
    };
    reader.onerror = (): void => {
      resolve({
        ok: false,
        reason: 'read',
        detail: 'The file could not be read. It stays on your device; nothing was uploaded.',
      });
    };
    reader.readAsText(file);
  });
}

/** Trigger a client-side download of the given text content. */
export function downloadTextFile(filename: string, content: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Release the object URL promptly; it never contains prompt data beyond this tab's memory.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
