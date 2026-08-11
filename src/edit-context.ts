import type { EditContext, SourcePosition } from "./types";

const ANCHOR_LENGTH = 160;

function sourcePosition(source: string, offset: number): SourcePosition {
  const before = source.slice(0, offset);
  const lines = before.split("\n");
  return {
    offset,
    line: lines.length,
    character: lines.at(-1)?.length ?? 0,
  };
}

export function fingerprintText(source: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}:${source.length}`;
}

export function locateRenderedSelection(noteContent: string, selectedText: string) {
  if (!selectedText) return null;
  const first = noteContent.indexOf(selectedText);
  if (first < 0) {
    return {
      match: "rendered-only" as const,
      occurrenceCount: 0,
      start: null,
      end: null,
      prefix: null,
      suffix: null,
    };
  }

  let occurrenceCount = 0;
  let cursor = first;
  while (cursor >= 0) {
    occurrenceCount += 1;
    cursor = noteContent.indexOf(selectedText, cursor + Math.max(selectedText.length, 1));
  }
  if (occurrenceCount !== 1) {
    return {
      match: "ambiguous" as const,
      occurrenceCount,
      start: null,
      end: null,
      prefix: null,
      suffix: null,
    };
  }

  const end = first + selectedText.length;
  return {
    match: "exact" as const,
    occurrenceCount,
    start: sourcePosition(noteContent, first),
    end: sourcePosition(noteContent, end),
    prefix: noteContent.slice(Math.max(0, first - ANCHOR_LENGTH), first),
    suffix: noteContent.slice(end, end + ANCHOR_LENGTH),
  };
}

export function buildEditContext(
  noteContent: string | undefined,
  selectedText: string,
  figure: { path: string; alt: string } | null,
): EditContext {
  const content = noteContent ?? "";
  const selection = selectedText ? locateRenderedSelection(content, selectedText) : null;
  return {
    selectedText: selectedText || null,
    figurePath: figure?.path ?? null,
    figureAlt: figure?.alt ?? null,
    noteRevision: noteContent === undefined ? null : fingerprintText(content),
    selectionMatch: selection?.match ?? null,
    selectionOccurrenceCount: selection?.occurrenceCount ?? null,
    selectionStart: selection?.start ?? null,
    selectionEnd: selection?.end ?? null,
    selectionPrefix: selection?.prefix ?? null,
    selectionSuffix: selection?.suffix ?? null,
  };
}
