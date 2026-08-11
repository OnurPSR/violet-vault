#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import katex from "katex";
import LZString from "lz-string";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { parseDocument } from "yaml";

const markdownParser = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkFrontmatter, ["yaml"]);
const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".svg", ".gif", ".webp"]);
const excalidrawTypes = new Set(["rectangle", "diamond", "ellipse", "image", "text", "line", "arrow", "freedraw", "embeddable", "frame", "magicframe"]);

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

function imageMetadata(filePath) {
  const extension = extname(filePath).toLowerCase();
  const buffer = readFileSync(filePath);
  if (extension === ".png" && buffer.length >= 24 && buffer.toString("ascii", 1, 4) === "PNG") {
    return { format: "png", width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), bytes: buffer.length };
  }
  if (extension === ".svg") {
    const source = buffer.toString("utf8", 0, Math.min(buffer.length, 65536));
    const open = source.toLowerCase().indexOf("<svg");
    const close = source.indexOf(">", open);
    const tag = open >= 0 && close > open ? source.slice(open, close + 1) : "";
    const attribute = (name) => {
      const marker = `${name}=`;
      const start = tag.toLowerCase().indexOf(marker.toLowerCase());
      if (start < 0) return null;
      const quote = tag[start + marker.length];
      const end = tag.indexOf(quote, start + marker.length + 1);
      return quote === '"' || quote === "'" ? tag.slice(start + marker.length + 1, end) : null;
    };
    return { format: "svg", width: Number.parseFloat(attribute("width")) || null, height: Number.parseFloat(attribute("height")) || null, viewBox: attribute("viewBox"), bytes: buffer.length };
  }
  return { format: extension.slice(1) || "unknown", width: null, height: null, bytes: buffer.length };
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

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function validateMermaidBlock(value, line, issue) {
  const lines = value.split("\n").map((entry) => entry.trim()).filter(Boolean);
  const directive = lines.find((entry) => !entry.startsWith("%%")) ?? "";
  if (!directive) {
    issue("error", "mermaid-empty", "Empty Mermaid block", line);
    return { line, directive: null, nonempty: false };
  }
  const supported = /^(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|quadrantChart|requirementDiagram|gitGraph|mindmap|timeline|sankey-beta|xychart-beta|block-beta|packet-beta|architecture-beta|kanban|radar-beta|treemap-beta|C4\w*)\b/;
  if (!supported.test(directive)) {
    issue("error", "mermaid-directive", `Unrecognized Mermaid diagram directive: ${directive.slice(0, 80)}`, line);
  }
  return { line, directive, nonempty: true };
}

function validateExcalidrawScene(scene, sourcePath, issue) {
  if (!scene || typeof scene !== "object" || Array.isArray(scene)) {
    issue("error", "excalidraw-scene", `Drawing root must be an object: ${sourcePath}`);
    return { path: sourcePath, valid: false, elements: 0 };
  }
  if (!Array.isArray(scene.elements)) {
    issue("error", "excalidraw-elements", `Drawing has no elements array: ${sourcePath}`);
    return { path: sourcePath, valid: false, elements: 0 };
  }

  const ids = new Set();
  const elementsById = new Map();
  const visible = [];
  for (const element of scene.elements) {
    if (!element || typeof element !== "object") {
      issue("error", "excalidraw-element", `Non-object element in ${sourcePath}`);
      continue;
    }
    if (typeof element.id !== "string" || !element.id) issue("error", "excalidraw-id", `Element without an id in ${sourcePath}`);
    else if (ids.has(element.id)) issue("error", "excalidraw-id-duplicate", `Duplicate element id ${element.id} in ${sourcePath}`);
    else {
      ids.add(element.id);
      elementsById.set(element.id, element);
    }
    if (!excalidrawTypes.has(element.type)) issue("warning", "excalidraw-type", `Unknown element type ${element.type} in ${sourcePath}`);
    for (const field of ["x", "y", "width", "height", "angle", "opacity", "strokeWidth"]) {
      if (!finiteNumber(element[field])) issue("error", "excalidraw-number", `${element.id ?? "element"}.${field} is not finite`, null, { path: sourcePath });
    }
    if (finiteNumber(element.width) && element.width < 0 || finiteNumber(element.height) && element.height < 0) issue("error", "excalidraw-size", `Negative element size in ${sourcePath}`);
    if (finiteNumber(element.opacity) && (element.opacity < 0 || element.opacity > 100)) issue("error", "excalidraw-opacity", `Opacity outside 0–100 in ${sourcePath}`);
    if (!Array.isArray(element.groupIds)) issue("error", "excalidraw-groups", `${element.id ?? "element"}.groupIds must be an array`, null, { path: sourcePath });
    if (!element.isDeleted) visible.push(element);
  }
  if (visible.length === 0) issue("error", "excalidraw-empty", `Excalidraw has no visible elements: ${sourcePath}`);

  const files = scene.files && typeof scene.files === "object" && !Array.isArray(scene.files) ? scene.files : {};
  for (const element of scene.elements) {
    if (!element || typeof element !== "object") continue;
    for (const bindingName of ["startBinding", "endBinding"]) {
      const binding = element[bindingName];
      if (binding && !elementsById.has(binding.elementId)) issue("error", "excalidraw-binding", `${element.id}.${bindingName} targets missing element ${binding.elementId}`, null, { path: sourcePath });
    }
    for (const bound of element.boundElements ?? []) {
      if (!bound?.id || !elementsById.has(bound.id)) issue("error", "excalidraw-bound-element", `${element.id} references missing bound element ${bound?.id}`, null, { path: sourcePath });
    }
    if (element.containerId && !elementsById.has(element.containerId)) issue("error", "excalidraw-container", `${element.id} targets missing container ${element.containerId}`, null, { path: sourcePath });
    if (["line", "arrow", "freedraw"].includes(element.type)) {
      if (!Array.isArray(element.points) || element.points.length < 2 || element.points.some((point) => !Array.isArray(point) || !finiteNumber(point[0]) || !finiteNumber(point[1]))) {
        issue("error", "excalidraw-points", `${element.id} has invalid points`, null, { path: sourcePath });
      }
    }
    if (element.type === "text") {
      if (typeof element.text !== "string" || !element.text.trim()) issue("error", "excalidraw-text", `Empty text element ${element.id}`, null, { path: sourcePath });
      if (!finiteNumber(element.fontSize) || element.fontSize <= 0) issue("error", "excalidraw-font", `Invalid font size on ${element.id}`, null, { path: sourcePath });
    }
    if (element.type === "image") {
      if (typeof element.fileId !== "string" || !files[element.fileId]) issue("error", "excalidraw-image-file", `Image ${element.id} references a missing file`, null, { path: sourcePath });
    }
  }
  for (const [fileId, file] of Object.entries(files)) {
    if (!file || typeof file !== "object" || typeof file.dataURL !== "string" || !file.dataURL.startsWith("data:image/")) {
      issue("error", "excalidraw-file-data", `Invalid embedded image file ${fileId}`, null, { path: sourcePath });
    }
  }

  const bounds = visible.length === 0 ? null : {
    minX: Math.min(...visible.map((element) => element.x)),
    minY: Math.min(...visible.map((element) => element.y)),
    maxX: Math.max(...visible.map((element) => element.x + element.width)),
    maxY: Math.max(...visible.map((element) => element.y + element.height)),
  };
  return { path: sourcePath, valid: true, elements: scene.elements.length, visibleElements: visible.length, files: Object.keys(files).length, bounds };
}

function validateExcalidraw(filePath, issue) {
  const text = readFileSync(filePath, "utf8");
  if (!text.trim()) {
    issue("error", "excalidraw-empty", `Empty Excalidraw file: ${filePath}`);
    return { path: filePath, valid: false, elements: 0 };
  }
  try {
    if (filePath.toLowerCase().endsWith(".excalidraw")) return validateExcalidrawScene(JSON.parse(text), filePath, issue);
    const tree = markdownParser.parse(text);
    const payloads = [];
    visit(tree, (node) => {
      if (node.type === "code" && ["json", "compressed-json"].includes((node.lang ?? "").toLowerCase())) payloads.push(node);
    });
    if (payloads.length !== 1) {
      issue("error", "excalidraw-payload", `Expected exactly one drawing payload, found ${payloads.length}: ${filePath}`);
      return { path: filePath, valid: false, elements: 0 };
    }
    const payload = payloads[0];
    let decoded = payload.value;
    if ((payload.lang ?? "").toLowerCase() === "compressed-json") {
      const compressed = payload.value.split(/\s+/).join("");
      decoded = LZString.decompressFromBase64(compressed) ?? LZString.decompressFromEncodedURIComponent(compressed);
      if (!decoded) throw new Error("Compressed drawing payload could not be decoded");
    }
    return validateExcalidrawScene(JSON.parse(decoded), filePath, issue);
  } catch (error) {
    issue("error", "excalidraw-parse", `${filePath}: ${error.message}`);
    return { path: filePath, valid: false, elements: 0 };
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
  const mermaid = [];
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
      mermaid.push(validateMermaidBlock(node.value, line, issue));
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
  const excalidraw = [];
  for (const asset of assets) {
    const lower = asset.absolute.toLowerCase();
    if (lower.endsWith(".excalidraw") || lower.endsWith(".excalidraw.md")) excalidraw.push(validateExcalidraw(asset.absolute, issue));
    else if (imageExtensions.has(extname(lower))) {
      asset.metadata = imageMetadata(asset.absolute);
      const displayedWidth = asset.width ? Number(asset.width.split("x")[0]) : null;
      if (displayedWidth && asset.metadata.width && displayedWidth > asset.metadata.width) issue("warning", "image-upscaled", `Embed width ${displayedWidth}px exceeds raster width ${asset.metadata.width}px: ${asset.target}`, asset.line);
      if (displayedWidth && displayedWidth > 1600) issue("warning", "embed-excessive-width", `Very wide embed: ${displayedWidth}px`, asset.line);
    }
  }

  const errors = issues.filter((entry) => entry.severity === "error");
  const warnings = issues.filter((entry) => entry.severity === "warning");
  const report = {
    schema: "violet-note-static-report/v2",
    vaultRoot,
    note: normalizeVaultPath(relative(vaultRoot, noteAbsolute)),
    bytes: Buffer.byteLength(text),
    parser: { markdown: "remark-parse", gfm: "remark-gfm", math: "remark-math + KaTeX", frontmatter: "remark-frontmatter + yaml", mermaid: "static directive validation" },
    summary: { errors: errors.length, warnings: warnings.length, links: links.length, embeds: assets.length, mathSegments: mathNodes.length, matrices: matrices.length, mermaidBlocks: mermaid.length, callouts: calloutCount, headings: headings.length },
    frontmatter,
    headings,
    links: links.map(({ absolute, candidates, ...entry }) => ({ ...entry, resolvedPath: absolute ? normalizeVaultPath(relative(vaultRoot, absolute)) : null, candidates: candidates?.map((candidate) => normalizeVaultPath(relative(vaultRoot, candidate))) })),
    assets: assets.map(({ absolute, candidates, ...entry }) => ({ ...entry, resolvedPath: normalizeVaultPath(relative(vaultRoot, absolute)), candidates: candidates?.map((candidate) => normalizeVaultPath(relative(vaultRoot, candidate))) })),
    excalidraw: excalidraw.map((entry) => ({ ...entry, path: normalizeVaultPath(relative(vaultRoot, entry.path)) })),
    matrices,
    mermaid,
    issues,
    manualRequired: ["Recompute arithmetic and review semantic matrix dimensions.", "Render and inspect changed Mermaid and layout-sensitive visuals in Obsidian when available."],
    ok: errors.length === 0,
  };
  const rendered = `${JSON.stringify(report, null, 2)}\n`;
  if (args.json) {
    const output = resolve(args.json);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, rendered);
  }
  process.stdout.write(`Static validation: ${report.ok ? "PASS" : "FAIL"}; ${errors.length} error(s), ${warnings.length} warning(s)\n`);
  for (const entry of issues) process.stdout.write(`${entry.severity.toUpperCase()} ${entry.code}${entry.line ? ` line ${entry.line}` : ""}: ${entry.message}\n`);
  if (args.json) process.stdout.write(`${resolve(args.json)}\n`);
  if (!report.ok) process.exit(1);
} catch (error) {
  process.stderr.write(`validate_note: ${error.message}\n`);
  process.exit(2);
}
