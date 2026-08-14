#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import katex from "katex";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { parseDocument } from "yaml";

const markdownParser = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkFrontmatter, ["yaml"]);
const figureExtensions = new Set([".png", ".jpg", ".jpeg", ".svg", ".gif", ".webp", ".bmp", ".tif", ".tiff", ".heic"]);

function usage(exitCode = 0) {
  const stream = exitCode === 0 ? process.stdout : process.stderr;
  stream.write("Usage: validate_note.mjs --vault <root> --note <vault-relative-note.md> [--json <report.json>]\n");
  process.exit(exitCode);
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") usage(0);
    if (arg === "--vault") result.vault = argv[++index];
    else if (arg === "--note") result.note = argv[++index];
    else if (arg === "--json") result.json = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!result.vault || !result.note) usage(2);
  return result;
}

function normalizeVaultPath(value) {
  return value.split(sep).join("/").replace(/^\.\//, "");
}

function resolveInside(root, requestedPath) {
  if (!requestedPath || isAbsolute(requestedPath)) throw new Error(`Expected vault-relative path: ${requestedPath}`);
  const absolute = resolve(root, requestedPath);
  if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) throw new Error(`Path escapes vault: ${requestedPath}`);
  if (existsSync(absolute)) {
    const real = realpathSync(absolute);
    if (real !== root && !real.startsWith(`${root}${sep}`)) throw new Error(`Symlink escapes vault: ${requestedPath}`);
  }
  return absolute;
}

function walkFiles(root) {
  const ignored = new Set([".git", "node_modules", ".trash"]);
  const files = [];
  const stack = [root];
  while (stack.length > 0) {
    const directory = stack.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (ignored.has(entry.name) || entry.isSymbolicLink()) continue;
      const absolute = resolve(directory, entry.name);
      if (entry.isDirectory()) stack.push(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  }
  return files;
}

function visit(node, visitor, parent = null) {
  visitor(node, parent);
  for (const child of node.children ?? []) visit(child, visitor, node);
}

function nodeText(node) {
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map(nodeText).join("");
}

function isDigits(value) {
  return value.length > 0 && [...value].every((character) => character >= "0" && character <= "9");
}

function scanWikiLinks(value) {
  const found = [];
  let cursor = 0;
  while (cursor < value.length) {
    const embedded = value.startsWith("![[", cursor);
    const linked = value.startsWith("[[", cursor);
    if (!embedded && !linked) {
      cursor += 1;
      continue;
    }
    const contentStart = cursor + (embedded ? 3 : 2);
    const end = value.indexOf("]]", contentStart);
    if (end === -1) {
      found.push({ malformed: true, embedded, offset: cursor, body: value.slice(contentStart) });
      break;
    }
    found.push({ embedded, offset: cursor, body: value.slice(contentStart, end) });
    cursor = end + 2;
  }
  return found;
}

function walkKatex(value, visitor, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (value.type) visitor(value);
  for (const [key, child] of Object.entries(value)) {
    if (key === "loc" || key === "lexer") continue;
    if (Array.isArray(child)) for (const item of child) walkKatex(item, visitor, seen);
    else walkKatex(child, visitor, seen);
  }
}

function validateMath(node, issue, matrices) {
  try {
    const tree = katex.__parse(node.value, {
      displayMode: node.type === "math",
      throwOnError: true,
      strict: "error",
      trust: false,
      maxExpand: 1000,
    });
    walkKatex(tree, (entry) => {
      if (entry.type !== "array" || !Array.isArray(entry.body)) return;
      const widths = entry.body.map((row) => Array.isArray(row) ? row.length : 0);
      const matrix = { line: node.position?.start.line ?? null, rows: widths.length, columns: Math.max(0, ...widths), consistent: widths.every((width) => width === widths[0]) };
      matrices.push(matrix);
      if (!matrix.consistent) issue("error", "matrix-row-width", `Matrix rows have different column counts: ${widths.join(", ")}`, matrix.line);
      if (matrix.rows > 4 || matrix.columns > 4) issue("warning", "large-latex-matrix", `Large ${matrix.rows}x${matrix.columns} LaTeX matrix may require a figure`, matrix.line);
    });
  } catch (error) {
    issue("error", "latex-parse", error.message, node.position?.start.line ?? null);
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  const vaultRoot = realpathSync(resolve(args.vault));
  const noteAbsolute = resolveInside(vaultRoot, args.note);
  if (!existsSync(noteAbsolute) || !statSync(noteAbsolute).isFile()) throw new Error(`Note not found: ${args.note}`);
  const text = readFileSync(noteAbsolute, "utf8");
  const noteDirectory = dirname(noteAbsolute);
  const issues = [];
  const issue = (severity, code, message, line = null, data = undefined) => issues.push({ severity, code, message, line, data });
  let tree;
  try { tree = markdownParser.parse(text); } catch (error) {
    issue("error", "markdown-parse", error.message, error.line ?? null);
    tree = { type: "root", children: [] };
  }

  const files = walkFiles(vaultRoot);
  const relativeFiles = new Map(files.map((file) => [normalizeVaultPath(relative(vaultRoot, file)), file]));
  const basenameIndex = new Map();
  for (const [vaultPath, absolute] of relativeFiles) {
    for (const key of new Set([basename(vaultPath), basename(vaultPath, extname(vaultPath))])) basenameIndex.set(key, [...(basenameIndex.get(key) ?? []), absolute]);
  }
  const definitions = new Map();
  visit(tree, (node) => { if (node.type === "definition") definitions.set(node.identifier.toLowerCase(), node.url); });

  function resolveLink(rawTarget) {
    const target = rawTarget.trim().replace(/^<|>$/g, "");
    if (!target) return { external: true };
    try { if (new URL(target).protocol) return { external: true }; } catch {}
    if (target.startsWith("#") || target.startsWith("^")) return { absolute: noteAbsolute, ambiguous: false };
    let decoded;
    try { decoded = decodeURIComponent(target); } catch { decoded = target; }
    const pathPart = decoded.split("#")[0];
    const candidates = [];
    for (const candidate of [resolve(vaultRoot, pathPart), resolve(noteDirectory, pathPart)]) {
      candidates.push(candidate);
      if (!extname(candidate)) candidates.push(`${candidate}.md`);
    }
    const exact = [...new Set(candidates)].filter((candidate) => existsSync(candidate) && statSync(candidate).isFile());
    if (exact.length === 1) return { absolute: exact[0], ambiguous: false };
    if (exact.length > 1) return { absolute: exact[0], ambiguous: true, candidates: exact };
    if (!pathPart.includes("/")) {
      const byName = basenameIndex.get(pathPart) ?? basenameIndex.get(basename(pathPart, extname(pathPart))) ?? [];
      if (byName.length === 1) return { absolute: byName[0], ambiguous: false };
      if (byName.length > 1) return { ambiguous: true, candidates: byName };
    }
    return { missing: true };
  }

  function validateSubpath(rawTarget, resolution, line) {
    if (!resolution.absolute) return;
    const hash = rawTarget.indexOf("#");
    const subpath = (hash >= 0 ? rawTarget.slice(hash + 1) : rawTarget.startsWith("^") ? rawTarget : "").trim();
    if (!subpath) return;
    const targetTree = markdownParser.parse(readFileSync(resolution.absolute, "utf8"));
    if (subpath.startsWith("^")) {
      const wanted = subpath.slice(1);
      let found = false;
      visit(targetTree, (node) => { if (node.type === "text" && node.value.split(/\s+/).includes(`^${wanted}`)) found = true; });
      if (!found) issue("error", "block-unresolved", `Unresolved block reference: ${rawTarget}`, line);
      return;
    }
    const wanted = subpath.replaceAll("%20", " ").trim().toLocaleLowerCase();
    const headings = [];
    visit(targetTree, (node) => { if (node.type === "heading") headings.push(nodeText(node).trim().toLocaleLowerCase()); });
    if (!headings.includes(wanted)) issue("error", "heading-unresolved", `Unresolved heading reference: ${rawTarget}`, line);
  }

  const links = [];
  const assets = [];
  function addLink(target, embedded, line, width = null, syntax = "markdown") {
    const resolution = resolveLink(target);
    if (resolution.external) return;
    const item = { syntax, embedded, target, line, width, ...resolution };
    links.push(item);
    if (resolution.missing) issue("error", embedded ? "attachment-missing" : "link-unresolved", `Unresolved ${embedded ? "embed" : "link"}: ${target}`, line);
    if (resolution.ambiguous) issue("warning", "link-ambiguous", `Ambiguous link: ${target}`, line);
    validateSubpath(target, resolution, line);
    if (embedded && resolution.absolute) assets.push({ ...item, absolute: resolution.absolute });
  }

  const headings = [];
  const mathNodes = [];
  const figures = [];
  let calloutCount = 0;
  let nestedCallout = false;
  let frontmatter = { present: false };
  visit(tree, (node, parent) => {
    const line = node.position?.start.line ?? null;
    if (node.type === "yaml") {
      frontmatter = { present: true, line };
      const document = parseDocument(node.value);
      if (document.errors.length > 0) for (const error of document.errors) issue("error", "frontmatter-yaml", error.message, line);
    }
    if (node.type === "heading") headings.push({ depth: node.depth, text: nodeText(node).trim(), line });
    if (node.type === "math" || node.type === "inlineMath") mathNodes.push(node);
    if (node.type === "code" && (node.lang ?? "").toLowerCase() === "mermaid") {
      figures.push({ kind: "mermaid", line });
    }
    if (node.type === "link" || node.type === "image") addLink(node.url, node.type === "image", line);
    if (node.type === "linkReference" || node.type === "imageReference") {
      const url = definitions.get(node.identifier.toLowerCase());
      if (!url) issue("error", "definition-unresolved", `Missing Markdown definition: ${node.identifier}`, line);
      else addLink(url, node.type === "imageReference", line);
    }
    if (node.type === "text") {
      for (const wiki of scanWikiLinks(node.value)) {
        const wikiLine = line + node.value.slice(0, wiki.offset).split("\n").length - 1;
        if (wiki.malformed) issue("error", "wikilink-unclosed", "Unclosed Obsidian wikilink", wikiLine);
        else {
          const [target, alias = ""] = wiki.body.split("|", 2);
          const widthParts = alias.toLowerCase().split("x");
          const width = widthParts.length <= 2 && widthParts.every(isDigits) ? alias : null;
          addLink(target.trim(), wiki.embedded, wikiLine, width, "wikilink");
        }
      }
    }
    if (node.type === "blockquote") {
      const first = node.children?.[0];
      if (first?.type === "paragraph" && nodeText(first).trim().startsWith("[!")) {
        calloutCount += 1;
        if (parent?.type === "blockquote") nestedCallout = true;
      }
    }
    if (node.type === "html") {
      const lower = node.value.toLowerCase();
      if (["<style", "<script", "<iframe", " style=", " class="].some((marker) => lower.includes(marker))) issue("warning", "theme-dependent-html", `Potentially risky HTML: ${node.value.slice(0, 80)}`, line);
    }
  });

  if (!headings.some((heading) => heading.depth === 1)) issue("warning", "heading-title", "No level-one title found");
  if (headings.filter((heading) => heading.depth === 1).length > 1) issue("warning", "heading-title", "Multiple level-one titles found");
  for (let index = 1; index < headings.length; index += 1) if (headings[index].depth > headings[index - 1].depth + 1) issue("warning", "heading-jump", `Heading depth jumps from H${headings[index - 1].depth} to H${headings[index].depth}`, headings[index].line);
  if (nestedCallout) issue("warning", "nested-callout", "Nested callout detected");
  const nonblankLines = text.split("\n").filter((line) => line.trim()).length;
  if (calloutCount > 3 && calloutCount / Math.max(nonblankLines, 1) > 0.08) issue("warning", "callout-density", `${calloutCount} callouts across ${nonblankLines} nonblank lines may be excessive`);

  const matrices = [];
  for (const node of mathNodes) validateMath(node, issue, matrices);
  for (const asset of assets) {
    const lower = asset.absolute.toLowerCase();
    const excalidraw = lower.endsWith(".excalidraw") || lower.endsWith(".excalidraw.md");
    if (!excalidraw && !figureExtensions.has(extname(lower))) continue;
    const kind = excalidraw ? "excalidraw" : "image";
    figures.push({ kind, line: asset.line, target: asset.target, resolvedPath: normalizeVaultPath(relative(vaultRoot, asset.absolute)) });
  }

  const errors = issues.filter((entry) => entry.severity === "error");
  const warnings = issues.filter((entry) => entry.severity === "warning");
  const report = {
    schema: "violet-note-structure-report/v3",
    vaultRoot,
    note: normalizeVaultPath(relative(vaultRoot, noteAbsolute)),
    bytes: Buffer.byteLength(text),
    parser: { markdown: "remark-parse", gfm: "remark-gfm", math: "remark-math + KaTeX", frontmatter: "remark-frontmatter + yaml" },
    summary: { errors: errors.length, warnings: warnings.length, links: links.length, embeds: assets.length, mathSegments: mathNodes.length, matrices: matrices.length, figureReferences: figures.length, callouts: calloutCount, headings: headings.length },
    frontmatter,
    headings,
    links: links.map(({ absolute, candidates, ...entry }) => ({ ...entry, resolvedPath: absolute ? normalizeVaultPath(relative(vaultRoot, absolute)) : null, candidates: candidates?.map((candidate) => normalizeVaultPath(relative(vaultRoot, candidate))) })),
    assets: assets.map(({ absolute, candidates, ...entry }) => ({ ...entry, resolvedPath: normalizeVaultPath(relative(vaultRoot, absolute)), candidates: candidates?.map((candidate) => normalizeVaultPath(relative(vaultRoot, candidate))) })),
    matrices,
    figures,
    issues,
    manualRequired: ["Recompute arithmetic and review semantic matrix dimensions.", "Apply the current run's visual-verification setting to every figure created or regenerated during this task."],
    ok: errors.length === 0,
  };
  const rendered = `${JSON.stringify(report, null, 2)}\n`;
  if (args.json) {
    const output = resolve(args.json);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, rendered);
  }
  process.stdout.write(`Structural validation: ${report.ok ? "PASS" : "FAIL"}; ${errors.length} error(s), ${warnings.length} warning(s)\n`);
  for (const entry of issues) process.stdout.write(`${entry.severity.toUpperCase()} ${entry.code}${entry.line ? ` line ${entry.line}` : ""}: ${entry.message}\n`);
  if (args.json) process.stdout.write(`${resolve(args.json)}\n`);
  if (!report.ok) process.exit(1);
} catch (error) {
  process.stderr.write(`validate_note: ${error.message}\n`);
  process.exit(2);
}
