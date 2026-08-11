import { readFile } from "node:fs/promises";
import path from "node:path";

export function fingerprintText(source) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}:${source.length}`;
}

export async function validateEditContextRevision(request) {
  const context = request?.editContext;
  if (request?.agentId !== "author-editor" || !request.notePath || !context?.noteRevision) return request;
  const content = await readFile(path.resolve(request.vaultPath, request.notePath), "utf8");
  if (fingerprintText(content) !== context.noteRevision) {
    throw new Error("The selected note changed after the edit target was captured. Refresh the note and select the target again.");
  }
  if (context.selectionMatch === "exact" && context.selectionStart && context.selectionEnd && context.selectedText) {
    const selected = content.slice(context.selectionStart.offset, context.selectionEnd.offset);
    if (selected !== context.selectedText) {
      throw new Error("The selected text no longer matches its raw Markdown range. Refresh the note and select it again.");
    }
  }
  return request;
}
