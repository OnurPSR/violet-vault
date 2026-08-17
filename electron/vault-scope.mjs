import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const IGNORED_DIRECTORIES = new Set([".git", "node_modules", ".trash", ".obsidian"]);

function normalize(relativePath) {
  return relativePath.split(path.sep).join("/").replace(/^\.\//, "");
}

export function authorizedWritePaths(request) {
  if (request?.agentId !== "author-editor") return [];
  const allowed = [];
  if (request.notePath) {
    const notePath = normalize(request.notePath);
    allowed.push({ kind: "file", path: notePath });
    const noteName = path.posix.basename(notePath, path.posix.extname(notePath));
    allowed.push({ kind: "directory", path: `attachments/${noteName}/` });
  }
  if (request.editContext?.figurePath) {
    allowed.push({ kind: "file", path: normalize(request.editContext.figurePath) });
  }
  return allowed;
}

export async function captureVaultManifest(vaultPath) {
  const root = path.resolve(vaultPath);
  const manifest = new Map();
  const stack = [{ absolute: root, relative: "" }];
  while (stack.length > 0) {
    const directory = stack.pop();
    for (const entry of await readdir(directory.absolute, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name))) continue;
      const absolute = path.join(directory.absolute, entry.name);
      const relative = normalize(path.join(directory.relative, entry.name));
      if (entry.isDirectory()) stack.push({ absolute, relative });
      else if (entry.isFile()) {
        const metadata = await stat(absolute);
        manifest.set(relative, `${metadata.size}:${metadata.mtimeMs}:${metadata.ctimeMs}`);
      }
    }
  }
  return manifest;
}

function isAllowed(filePath, allowed) {
  return allowed.some((entry) => entry.kind === "file"
    ? filePath === entry.path
    : filePath.startsWith(entry.path));
}

export function auditVaultChanges(before, after, allowed) {
  const changed = [];
  const paths = new Set([...before.keys(), ...after.keys()]);
  for (const filePath of paths) {
    if (before.get(filePath) === after.get(filePath)) continue;
    if (!isAllowed(filePath, allowed)) changed.push(filePath);
  }
  return changed.sort((a, b) => a.localeCompare(b));
}

export function formatScopeWarning(paths) {
  if (paths.length === 0) return "";
  const displayed = paths.slice(0, 20).map((filePath) => `- ${filePath}`).join("\n");
  const remaining = paths.length > 20 ? `\n- …and ${paths.length - 20} more` : "";
  return `\n\nScope audit warning: the agent changed files outside the selected note and its authorized companion assets:\n${displayed}${remaining}\nReview these changes before relying on the result.`;
}
