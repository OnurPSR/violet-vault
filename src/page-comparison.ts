export type ComparisonPage = {
  number: number;
  heading: string;
  /** Page-section markdown with the handwritten-source link removed. */
  content: string;
  /** Vault path (or unique bare filename) of the linked handwritten source image. */
  imagePath: string;
  imageName: string;
};

const IMAGE_EXTENSION_PATTERN = /\.(?:png|jpe?g|webp|gif|bmp|tiff?|heic|svg)$/i;
const SOURCE_PAGE_FILENAME_PATTERN = /^page-\d+\.[^.\/]+$/i;
const PAGE_HEADING_PATTERN = /^(#{1,6})\s+page\s+(\d+)\b/i;

function decodePath(source: string) {
  try { return decodeURIComponent(source); } catch { return source; }
}

/** Resolves `.`/`..` segments the same way the rendered view does. */
function resolveVaultPath(target: string, noteDirectory: string) {
  const rootRelative = target.startsWith("/");
  const segments = rootRelative || !noteDirectory
    ? target.replace(/^\/+/, "").split("/")
    : [...noteDirectory.split("/"), ...target.split("/")];
  const normalized: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") normalized.pop();
    else normalized.push(segment);
  }
  return normalized.join("/");
}

function cleanImageTarget(target: string) {
  const withoutAngles = target.trim().replace(/^<|>$/g, "");
  const withoutQuery = withoutAngles.split(/[?#]/, 1)[0];
  if (/^[a-z][a-z0-9+.-]*:/i.test(withoutQuery)) return null;
  const decoded = decodePath(withoutQuery);
  return IMAGE_EXTENSION_PATTERN.test(decoded) ? decoded : null;
}

/**
 * Decides whether a linked image is one of the note's handwritten source
 * pages. Sources live in `attachments/{note_name}/notes/`, so a path target
 * must resolve into that directory. Obsidian writes both note-relative
 * (`../../attachments/…`) and vault-root-relative (`attachments/…`) targets,
 * so whichever interpretation lands in the source directory wins. A bare
 * `page-N.ext` filename also qualifies — Obsidian and the app's asset loader
 * both resolve unique bare names anywhere in the vault, and reconstructed
 * notes only use that shape for staged source pages.
 */
function sourcePagePath(target: string | null, sourceDirectory: string, noteDirectory: string, wikiLink: boolean) {
  if (!target) return null;
  if (!target.includes("/")) {
    return SOURCE_PAGE_FILENAME_PATTERN.test(target) ? target : null;
  }
  const candidates = wikiLink
    ? [resolveVaultPath(target, "")]
    : [resolveVaultPath(target, ""), resolveVaultPath(target, noteDirectory)];
  return candidates.find((candidate) => candidate.toLowerCase().startsWith(sourceDirectory)) ?? null;
}

/** Finds the section's source-page link; the last match wins because the contract places it at the section end. */
function findLinkedImage(section: string, sourceDirectory: string, noteDirectory: string) {
  let found: { path: string; index: number } | null = null;
  for (const match of section.matchAll(/!?\[[^\]]*\]\(\s*(<[^>]*>|[^()\s]+)(?:\s+"[^"]*")?\s*\)/g)) {
    const target = sourcePagePath(cleanImageTarget(match[1]), sourceDirectory, noteDirectory, false);
    if (target) found = { path: target, index: match.index ?? 0 };
  }
  for (const match of section.matchAll(/!?\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) {
    const target = sourcePagePath(cleanImageTarget(match[1]), sourceDirectory, noteDirectory, true);
    if (target && (!found || (match.index ?? 0) > found.index)) found = { path: target, index: match.index ?? 0 };
  }
  return found?.path ?? null;
}

/** Drops the standalone source-link line so the rendered pane shows only the reconstruction. */
function stripSourceLinkLine(section: string, imagePath: string) {
  const imageName = imagePath.split("/").at(-1) ?? imagePath;
  return section
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      const isLinkOnly = /^!?\[[^\]]*\]\([^)]*\)$/.test(trimmed) || /^!?\[\[[^\]]+\]\]$/.test(trimmed);
      return !(isLinkOnly && (decodePath(trimmed).includes(imageName)));
    })
    .join("\n")
    .trim();
}

/**
 * Splits a reconstructed note into comparable page sections. Returns null when
 * the note is empty, has no `Page N` headings, or any page section lacks a
 * link to its handwritten source page in `attachments/{note_name}/notes/` —
 * the comparison option only appears when every page can be placed beside its
 * handwritten source.
 */
export function extractComparisonPages(content: string | undefined | null, notePath: string | undefined | null): ComparisonPage[] | null {
  if (!content || !notePath) return null;
  const noteName = (notePath.split("/").at(-1) ?? notePath).replace(/\.md$/i, "");
  const noteDirectory = notePath.split("/").slice(0, -1).join("/");
  const sourceDirectory = `attachments/${noteName.toLowerCase()}/notes/`;
  const body = content.replace(/^---\n[\s\S]*?\n---\n/, "");
  if (!body.trim()) return null;

  const lines = body.split("\n");
  const starts: { line: number; number: number; heading: string }[] = [];
  let fence: string | null = null;
  for (const [index, line] of lines.entries()) {
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null;
      continue;
    }
    if (fenceMatch) {
      fence = fenceMatch[1];
      continue;
    }
    const heading = line.match(PAGE_HEADING_PATTERN);
    if (heading) starts.push({ line: index, number: Number(heading[2]), heading: line.replace(/^#+\s+/, "").trim() });
  }
  if (starts.length === 0) return null;

  const pages: ComparisonPage[] = [];
  for (const [position, start] of starts.entries()) {
    const end = position + 1 < starts.length ? starts[position + 1].line : lines.length;
    const section = lines.slice(start.line + 1, end).join("\n");
    const imagePath = findLinkedImage(section, sourceDirectory, noteDirectory);
    if (!imagePath) return null;
    pages.push({
      number: start.number,
      heading: start.heading,
      content: stripSourceLinkLine(section, imagePath),
      imagePath,
      imageName: imagePath.split("/").at(-1) ?? imagePath,
    });
  }
  return pages;
}
