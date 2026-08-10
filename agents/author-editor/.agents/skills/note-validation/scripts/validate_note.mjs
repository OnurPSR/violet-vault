#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";

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
  return absolute;
}

function walkFiles(root) {
  const ignored = new Set([".git", "node_modules", ".trash"]);
  const files = [];
  const stack = [root];
  while (stack.length > 0) {
    const directory = stack.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const absolute = resolve(directory, entry.name);
      if (entry.isDirectory()) stack.push(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  }
  return files;
}

function lineAt(text, offset) {
  return text.slice(0, offset).split("\n").length;
}

function stripFencedAndInlineCode(text) {
  return text
    .replace(/^(`{3,}|~{3,}).*\n[\s\S]*?^\1\s*$/gm, (match) => match.replace(/[^\n]/g, " "))
    .replace(/`+[^`\n]*`+/g, (match) => " ".repeat(match.length));
}

function findUnescaped(text, token, start) {
  for (let index = start; index <= text.length - token.length; index += 1) {
    if (text.startsWith(token, index) && (index === 0 || text[index - 1] !== "\\")) return index;
  }
  return -1;
}

function extractMath(text, issue) {
  const source = stripFencedAndInlineCode(text);
  const segments = [];
  let index = 0;
  while (index < source.length) {
    if (source[index] !== "$" || (index > 0 && source[index - 1] === "\\")) {
      index += 1;
      continue;
    }
    const token = source[index + 1] === "$" ? "$$" : "$";
    const end = findUnescaped(source, token, index + token.length);
    if (end === -1) {
      issue("error", "latex-unbalanced-dollar", `Unclosed ${token} delimiter`, lineAt(source, index));
      break;
    }
    segments.push({ content: source.slice(index + token.length, end), display: token === "$$", line: lineAt(source, index) });
    index = end + token.length;
  }
  return segments;
}

function validateMathSegment(segment, issue, matrices) {
  const braces = [];
  for (let index = 0; index < segment.content.length; index += 1) {
    const char = segment.content[index];
    if (index > 0 && segment.content[index - 1] === "\\") continue;
    if (char === "{") braces.push(index);
    if (char === "}" && braces.length === 0) issue("error", "latex-unbalanced-brace", "Closing brace without opener", segment.line);
    else if (char === "}") braces.pop();
  }
  if (braces.length > 0) issue("error", "latex-unbalanced-brace", `${braces.length} unclosed brace(s)`, segment.line);

  const environmentStack = [];
  const environmentPattern = /\\(begin|end)\{([^}]+)\}/g;
  for (const match of segment.content.matchAll(environmentPattern)) {
    if (match[1] === "begin") environmentStack.push(match[2]);
    else if (environmentStack.pop() !== match[2]) {
      issue("error", "latex-environment", `Mismatched \\end{${match[2]}}`, segment.line);
    }
  }
  if (environmentStack.length > 0) {
    issue("error", "latex-environment", `Unclosed environment(s): ${environmentStack.join(", ")}`, segment.line);
  }

  const unsupported = /\\(usepackage|newcommand|renewcommand|providecommand|def|require|DeclareMathOperator)\b/g;
  for (const match of segment.content.matchAll(unsupported)) {
    issue("error", "latex-unsupported-macro", `Unsupported or custom macro: \\${match[1]}`, segment.line);
  }

  const matrixPattern = /\\begin\{(bmatrix|pmatrix|matrix|Bmatrix|vmatrix|Vmatrix)\}([\s\S]*?)\\end\{\1\}/g;
  for (const match of segment.content.matchAll(matrixPattern)) {
    const rows = match[2].split(/\\\\/).map((row) => row.trim()).filter(Boolean);
    const widths = rows.map((row) => row.split("&").length);
    const consistent = widths.every((width) => width === widths[0]);
    matrices.push({ line: segment.line, environment: match[1], rows: rows.length, columns: widths[0] ?? 0, consistent });
    if (!consistent) issue("error", "matrix-row-width", `Matrix rows have different column counts: ${widths.join(", ")}`, segment.line);
    if (rows.length > 4 || Math.max(0, ...widths) > 4) {
      issue("warning", "large-latex-matrix", `Large ${rows.length}x${Math.max(0, ...widths)} LaTeX matrix may require a figure`, segment.line);
    }
  }
}

function parseFrontmatter(text, issue) {
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) return { present: false };
  const lines = text.split(/\r?\n/);
  const end = lines.slice(1).findIndex((line) => line === "---");
  if (end === -1) issue("error", "frontmatter", "Frontmatter has no closing delimiter", 1);
  return { present: true, closed: end !== -1, lines: end === -1 ? lines.length : end + 2 };
}

function parseHeadings(text, issue) {
  const headings = [];
  for (const match of text.matchAll(/^(#{1,6})\s+(.+)$/gm)) {
    headings.push({ depth: match[1].length, text: match[2].trim(), line: lineAt(text, match.index) });
  }
  if (!headings.some((heading) => heading.depth === 1)) issue("warning", "heading-title", "No level-one title found");
  if (headings.filter((heading) => heading.depth === 1).length > 1) issue("warning", "heading-title", "Multiple level-one titles found");
  for (let index = 1; index < headings.length; index += 1) {
    if (headings[index].depth > headings[index - 1].depth + 1) {
      issue("warning", "heading-jump", `Heading depth jumps from H${headings[index - 1].depth} to H${headings[index].depth}`, headings[index].line);
    }
  }
  return headings;
}

function imageMetadata(path) {
  const extension = extname(path).toLowerCase();
  const buffer = readFileSync(path);
  if (extension === ".png" && buffer.length >= 24 && buffer.toString("ascii", 1, 4) === "PNG") {
    return { format: "png", width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), bytes: buffer.length };
  }
  if (extension === ".svg") {
    const source = buffer.toString("utf8", 0, Math.min(buffer.length, 65536));
    const svg = /<svg\b([^>]*)>/i.exec(source)?.[1] ?? "";
    const width = /\bwidth=["']([\d.]+)/i.exec(svg)?.[1];
    const height = /\bheight=["']([\d.]+)/i.exec(svg)?.[1];
    const viewBox = /\bviewBox=["']([^"']+)/i.exec(svg)?.[1];
    return { format: "svg", width: width ? Number(width) : null, height: height ? Number(height) : null, viewBox: viewBox ?? null, bytes: buffer.length };
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]).has(marker)) {
        return { format: "jpeg", width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5), bytes: buffer.length };
      }
      offset += 2 + length;
    }
  }
  return { format: extension.slice(1) || "unknown", width: null, height: null, bytes: buffer.length };
}

function validateExcalidraw(path, issue) {
  const text = readFileSync(path, "utf8");
  if (text.trim().length === 0) {
    issue("error", "excalidraw-empty", `Empty Excalidraw file: ${path}`);
    return { path, valid: false, elements: 0 };
  }
  if (path.endsWith(".excalidraw")) {
    try {
      const drawing = JSON.parse(text);
      const elements = Array.isArray(drawing.elements) ? drawing.elements.length : 0;
      if (elements === 0) issue("error", "excalidraw-empty", `Excalidraw has no elements: ${path}`);
      return { path, valid: Array.isArray(drawing.elements), elements };
    } catch (error) {
      issue("error", "excalidraw-json", `Invalid Excalidraw JSON: ${path}: ${error.message}`);
      return { path, valid: false, elements: 0 };
    }
  }
  const hasDrawing = /## Drawing|```(?:compressed-json|json)/.test(text);
  if (!hasDrawing) issue("error", "excalidraw-markdown", `Missing Excalidraw drawing payload: ${path}`);
  return { path, valid: hasDrawing, elements: null, pluginRenderRequired: true };
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
  const files = walkFiles(vaultRoot);
  const relativeFiles = new Map(files.map((file) => [normalizeVaultPath(relative(vaultRoot, file)), file]));
  const basenameIndex = new Map();
  for (const [vaultPath, absolute] of relativeFiles) {
    const keys = new Set([basename(vaultPath), basename(vaultPath, extname(vaultPath))]);
    for (const key of keys) basenameIndex.set(key, [...(basenameIndex.get(key) ?? []), absolute]);
  }

  function resolveLink(rawTarget) {
    const target = rawTarget.trim().replace(/^<|>$/g, "");
    if (!target) return { external: true };
    if (/^[a-z]+:/i.test(target)) return { external: true };
    if (target.startsWith("#") || target.startsWith("^")) return { absolute: noteAbsolute, ambiguous: false };
    let decoded;
    try { decoded = decodeURIComponent(target); } catch { decoded = target; }
    const pathPart = decoded.split("#")[0];
    const candidates = [];
    const direct = [resolve(vaultRoot, pathPart), resolve(noteDirectory, pathPart)];
    for (const candidate of direct) {
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
    const hashIndex = rawTarget.indexOf("#");
    const subpath = (hashIndex >= 0 ? rawTarget.slice(hashIndex + 1) : rawTarget.startsWith("^") ? rawTarget : "").trim();
    if (!subpath) return;
    const targetText = readFileSync(resolution.absolute, "utf8");
    if (subpath.startsWith("^")) {
      const blockId = subpath.slice(1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (!new RegExp(`\\^${blockId}(?:\\s|$)`, "m").test(targetText)) {
        issue("error", "block-unresolved", `Unresolved block reference: ${rawTarget}`, line);
      }
      return;
    }
    const wanted = subpath.replaceAll("%20", " ").trim().toLocaleLowerCase();
    const headings = [...targetText.matchAll(/^#{1,6}\s+(.+)$/gm)].map((match) => match[1].trim().toLocaleLowerCase());
    if (!headings.includes(wanted)) issue("error", "heading-unresolved", `Unresolved heading reference: ${rawTarget}`, line);
  }

  const links = [];
  const assets = [];
  const excalidraw = [];
  const wikiPattern = /(!?)\[\[([^\]]+)\]\]/g;
  for (const match of text.matchAll(wikiPattern)) {
    const embedded = match[1] === "!";
    const body = match[2];
    const targetWithAnchor = body.split("|")[0].trim();
    const resolution = resolveLink(targetWithAnchor);
    const item = { syntax: "wikilink", embedded, target: targetWithAnchor, line: lineAt(text, match.index), ...resolution };
    links.push(item);
    if (resolution.missing) issue("error", embedded ? "attachment-missing" : "link-unresolved", `Unresolved ${embedded ? "embed" : "link"}: ${targetWithAnchor}`, item.line);
    if (resolution.ambiguous) issue("warning", "link-ambiguous", `Ambiguous link: ${targetWithAnchor}`, item.line);
    validateSubpath(targetWithAnchor, resolution, item.line);
    if (embedded && resolution.absolute) assets.push({ ...item, absolute: resolution.absolute, width: /^\d+(?:x\d+)?$/.test(body.split("|").at(-1)) ? body.split("|").at(-1) : null });
  }

  const markdownLinkPattern = /(!?)\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of text.matchAll(markdownLinkPattern)) {
    const embedded = match[1] === "!";
    const raw = match[2].trim().replace(/\s+["'][^"']*["']$/, "");
    const resolution = resolveLink(raw);
    if (resolution.external) continue;
    const item = { syntax: "markdown", embedded, target: raw, line: lineAt(text, match.index), ...resolution };
    links.push(item);
    if (resolution.missing) issue("error", embedded ? "attachment-missing" : "link-unresolved", `Unresolved ${embedded ? "image" : "link"}: ${raw}`, item.line);
    if (resolution.ambiguous) issue("warning", "link-ambiguous", `Ambiguous link: ${raw}`, item.line);
    validateSubpath(raw, resolution, item.line);
    if (embedded && resolution.absolute) assets.push({ ...item, absolute: resolution.absolute, width: null });
  }

  for (const asset of assets) {
    const lower = asset.absolute.toLowerCase();
    if (lower.endsWith(".excalidraw") || lower.endsWith(".excalidraw.md")) {
      excalidraw.push(validateExcalidraw(asset.absolute, issue));
      continue;
    }
    if (/\.(png|jpe?g|svg|gif|webp)$/i.test(lower)) {
      asset.metadata = imageMetadata(asset.absolute);
      const displayedWidth = asset.width ? Number(asset.width.split("x")[0]) : null;
      if (displayedWidth && asset.metadata.width && displayedWidth > asset.metadata.width) {
        issue("warning", "image-upscaled", `Embed width ${displayedWidth}px exceeds raster width ${asset.metadata.width}px: ${asset.target}`, asset.line);
      }
      if (displayedWidth && displayedWidth > 1600) issue("warning", "embed-excessive-width", `Very wide embed: ${displayedWidth}px`, asset.line);
    }
  }

  const frontmatter = parseFrontmatter(text, issue);
  const headings = parseHeadings(stripFencedAndInlineCode(text), issue);
  const matrices = [];
  const mathSegments = extractMath(text, issue);
  for (const segment of mathSegments) validateMathSegment(segment, issue, matrices);

  const arithmetic = [];
  const arithmeticPattern = /(-?\d[\d,]*(?:\.\d+)?)\s*(\\times|\\cdot|\\div|[+\-*×÷/^])\s*(-?\d[\d,]*(?:\.\d+)?)\s*=\s*(-?\d[\d,]*(?:\.\d+)?)/g;
  for (const match of stripFencedAndInlineCode(text).matchAll(arithmeticPattern)) {
    const left = Number(match[1].replaceAll(",", ""));
    const right = Number(match[3].replaceAll(",", ""));
    const stated = Number(match[4].replaceAll(",", ""));
    const operator = match[2];
    const computed = operator === "+" ? left + right
      : operator === "-" ? left - right
        : new Set(["*", "×", "\\times", "\\cdot"]).has(operator) ? left * right
          : operator === "^" ? left ** right
            : left / right;
    const ok = Number.isFinite(computed) && Math.abs(computed - stated) <= Math.max(1e-12, Math.abs(computed) * 1e-12);
    arithmetic.push({ expression: match[0], computed, stated, ok, line: lineAt(text, match.index) });
    if (!ok) issue("error", "arithmetic-mismatch", `${match[1]} ${operator} ${match[3]} computes to ${computed}, not ${stated}`, lineAt(text, match.index));
  }

  const mermaid = [];
  for (const match of text.matchAll(/^```mermaid\s*\n([\s\S]*?)^```\s*$/gm)) {
    const body = match[1].trim();
    const first = body.split(/\r?\n/)[0] ?? "";
    const entry = { line: lineAt(text, match.index), firstLine: first, nonempty: body.length > 0 };
    mermaid.push(entry);
    if (!body) issue("error", "mermaid-empty", "Empty Mermaid block", entry.line);
    else if (!/^(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|timeline|mindmap|quadrantChart|xychart-beta|block-beta|packet-beta|kanban|architecture-beta)\b/.test(first)) {
      issue("warning", "mermaid-directive", `Unrecognized Mermaid opening directive: ${first}`, entry.line);
    }
  }

  for (const match of text.matchAll(/<(?:style|script|iframe)\b|<(?:div|span|table)\b[^>]*(?:style|class)=/gi)) {
    issue("warning", "theme-dependent-html", `Potentially theme-dependent HTML: ${match[0].slice(0, 80)}`, lineAt(text, match.index));
  }

  const calloutCount = [...text.matchAll(/^\s*>\s*\[![^\]]+\]/gm)].length;
  const nonblankLines = text.split(/\r?\n/).filter((line) => line.trim()).length;
  if (calloutCount > 3 && calloutCount / Math.max(nonblankLines, 1) > 0.08) {
    issue("warning", "callout-density", `${calloutCount} callouts across ${nonblankLines} nonblank lines may be excessive`);
  }
  if (/^\s*>\s*>\s*\[!/m.test(text)) issue("warning", "nested-callout", "Nested callout detected");

  const uncertaintyMarkers = [...text.matchAll(/\[(?:UNCERTAIN|UNREADABLE|illegible)\b[^\]]*\]/gi)].map((match) => ({ line: lineAt(text, match.index), marker: match[0] }));
  const errors = issues.filter((entry) => entry.severity === "error");
  const warnings = issues.filter((entry) => entry.severity === "warning");
  const report = {
    schema: "violet-note-static-report/v1",
    vaultRoot,
    note: normalizeVaultPath(relative(vaultRoot, noteAbsolute)),
    bytes: Buffer.byteLength(text),
    summary: {
      errors: errors.length,
      warnings: warnings.length,
      links: links.length,
      embeds: assets.length,
      mathSegments: mathSegments.length,
      matrices: matrices.length,
      arithmeticExpressions: arithmetic.length,
      mermaidBlocks: mermaid.length,
      callouts: calloutCount,
      headings: headings.length,
    },
    frontmatter,
    headings,
    links: links.map(({ absolute, candidates, ...entry }) => ({ ...entry, resolvedPath: absolute ? normalizeVaultPath(relative(vaultRoot, absolute)) : null, candidates: candidates?.map((candidate) => normalizeVaultPath(relative(vaultRoot, candidate))) })),
    assets: assets.map(({ absolute, candidates, ...entry }) => ({ ...entry, resolvedPath: normalizeVaultPath(relative(vaultRoot, absolute)), candidates: candidates?.map((candidate) => normalizeVaultPath(relative(vaultRoot, candidate))) })),
    excalidraw: excalidraw.map((entry) => ({ ...entry, path: normalizeVaultPath(relative(vaultRoot, entry.path)) })),
    matrices,
    arithmetic,
    mermaid,
    uncertaintyMarkers,
    issues,
    manualRequired: [
      "Compare every applicable source region, symbol, index, dimension, approximation, arrow, and cross-page continuation with the source images.",
      "Confirm uncertainty is disclosed wherever the source remains ambiguous.",
      "Judge reading order, containment, relative prominence, renderer choice, attached figure text, and embed width.",
      "Recompute arithmetic not recognized as a simple binary expression and review semantic tensor or matrix dimensions.",
      "Inspect every formula, Mermaid block, Excalidraw render, image, callout, and important layout in Obsidian Reading view at full and narrow widths.",
    ],
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
