#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import { dirname, extname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(scriptPath), "../../../../../..");
const mimeTypes = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp" };

function usage(exitCode = 0) {
  const stream = exitCode === 0 ? process.stdout : process.stderr;
  stream.write("Usage: render_check.mjs --vault <root> --note <note.md> [--region <heading>] [--source <image>] [--out <directory>]\nNote and source paths may be vault-relative or absolute inside the vault.\n");
  process.exit(exitCode);
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") usage(0);
    else if (arg === "--vault") result.vault = argv[++index];
    else if (arg === "--note") result.note = argv[++index];
    else if (arg === "--region") result.region = argv[++index];
    else if (arg === "--source") result.source = argv[++index];
    else if (arg === "--out") result.out = argv[++index];
    else if (arg === "--html") result.html = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return result;
}

function resolveInside(root, requestedPath) {
  if (!requestedPath) throw new Error("Expected a path inside the vault.");
  const cleaned = requestedPath.split(/[?#]/, 1)[0];
  const absolute = isAbsolute(cleaned) ? resolve(cleaned) : resolve(root, cleaned);
  if (!absolute.startsWith(`${root}${sep}`)) throw new Error(`Path escapes vault: ${requestedPath}`);
  if (existsSync(absolute) && !realpathSync(absolute).startsWith(`${root}${sep}`)) throw new Error(`Symlink escapes vault: ${requestedPath}`);
  return absolute;
}

export function sliceRegion(markdown, region) {
  if (!region) return markdown;
  const lines = markdown.split("\n");
  const wanted = region.trim().toLowerCase();
  const start = lines.findIndex((line) => {
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    return heading ? heading[2].trim().toLowerCase() === wanted : false;
  });
  if (start < 0) throw new Error(`Region heading not found: ${region}`);
  const level = lines[start].match(/^#+/)[0].length;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const heading = lines[index].match(/^(#{1,6})\s+/);
    if (heading && heading[1].length <= level) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

/** Obsidian resolves a bare embed name anywhere in the vault, the same way readVaultAsset does. */
function resolveFigure(vaultRoot, relativePath) {
  const direct = resolveInside(vaultRoot, relativePath);
  if (existsSync(direct)) return direct;
  if (relativePath.includes("/")) throw new Error(`Figure not found: ${relativePath}`);
  const wanted = relativePath.toLowerCase();
  const matches = [];
  const queue = [vaultRoot];
  while (queue.length > 0 && matches.length < 2) {
    for (const entry of readdirSync(queue.pop(), { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const absolute = join(entry.parentPath, entry.name);
      if (entry.isDirectory()) queue.push(absolute);
      else if (entry.name.toLowerCase() === wanted) matches.push(absolute);
    }
  }
  if (matches.length !== 1) throw new Error(matches.length ? `Ambiguous figure name: ${relativePath}` : `Figure not found: ${relativePath}`);
  return matches[0];
}

function dataUri(absolute) {
  const type = mimeTypes[extname(absolute).toLowerCase()];
  if (!type) throw new Error(`Unsupported figure type: ${absolute}`);
  return `data:${type};base64,${readFileSync(absolute).toString("base64")}`;
}

/** A file:// document treats sibling font files as cross-origin, so KaTeX only renders from data URIs. */
function embedKatexFonts(css, katexDist) {
  return css.replace(/url\(fonts\/([\w-]+)\.woff2\)/g, (match, family) => {
    const font = join(katexDist, "fonts", `${family}.woff2`);
    return existsSync(font) ? `url(data:font/woff2;base64,${readFileSync(font).toString("base64")})` : match;
  });
}

/**
 * Embedded SVG is inlined rather than wrapped in <img> so the measuring pass can
 * reach individual <text> nodes and detect labels drawn outside the viewBox.
 */
function inlineEmbeds(html, vaultRoot, sanitizeVaultSvg, parseEmbedDimensions) {
  return html.replace(/<img\s+src="([^"]+)"(?:\s+alt="([^"]*)")?[^>]*>/g, (_match, source, alt = "") => {
    const decoded = decodeURIComponent(source).split(/[?#]/, 1)[0].replace(/^\//, "");
    const dimensions = parseEmbedDimensions(source);
    const style = dimensions ? `width:${dimensions.width}px;${dimensions.height ? `height:${dimensions.height}px;` : ""}max-width:100%` : "max-width:100%";
    let absolute;
    try {
      absolute = resolveFigure(vaultRoot, decoded);
    } catch {
      return `<span class="figure" data-figure="${decoded}" data-missing="1">Figure unavailable · ${alt}</span>`;
    }
    const body = extname(absolute).toLowerCase() === ".svg"
      ? sanitizeVaultSvg(readFileSync(absolute, "utf8")).replace(/<svg\b/i, `<svg style="width:100%;height:auto"`)
      : `<img src="${dataUri(absolute)}" alt="${alt}" style="width:100%">`;
    return `<span class="figure" data-figure="${decoded}" style="${style}">${body}</span>`;
  });
}

function harnessDocument({ noteHtml, sourceUri, katexCss, mermaidScript }) {
  return `<!doctype html>
<meta charset="utf-8">
<style>
${katexCss}
body { margin: 0; width: max-content; display: flex; align-items: flex-start; gap: 24px; padding: 24px; background: #e9ecef; font: 16px/1.6 system-ui, sans-serif; color: #212529; }
.column { background: #fff; padding: 24px; border-radius: 8px; }
.source { width: 620px; }
.source img { width: 100%; }
.note-viewport { width: 700px; }
.note-viewport img, .note-viewport svg { display: block; }
.figure { display: block; margin: 12px 0; }
.label { font: 600 13px/1 system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: #868e96; margin-bottom: 12px; }
</style>
${sourceUri ? `<div class="column source"><div class="label">Source</div><img src="${sourceUri}" alt="Source page"></div>` : ""}
<div class="column note-viewport"><div class="label">Rendered note</div><div id="note">${noteHtml}</div></div>
${mermaidScript ? `<script>${mermaidScript}</script>` : ""}
<script>
function measure() {
  const viewport = document.getElementById("note");
  const issues = [];
  const figures = [...document.querySelectorAll(".figure")].map((node) => {
    const path = node.dataset.figure;
    if (node.dataset.missing) {
      issues.push({ code: "figure-unresolved", figure: path });
      return { figure: path, resolved: false };
    }
    const box = node.getBoundingClientRect();
    const svg = node.querySelector("svg");
    const raster = node.querySelector("img");
    const entry = { figure: path, resolved: true, rendered: { width: Math.round(box.width), height: Math.round(box.height) } };
    if (raster) {
      entry.intrinsic = { width: raster.naturalWidth, height: raster.naturalHeight };
      if (!raster.naturalWidth) issues.push({ code: "figure-unresolved", figure: path });
      return entry;
    }
    if (!svg) return entry;
    const view = svg.viewBox.baseVal;
    const scale = view.width ? box.width / view.width : 1;
    entry.intrinsic = { width: Math.round(view.width), height: Math.round(view.height) };
    entry.scale = Number(scale.toFixed(3));
    const texts = [...svg.querySelectorAll("text")];
    const clipped = texts.filter((text) => {
      const bounds = text.getBBox();
      return bounds.x < view.x || bounds.y < view.y || bounds.x + bounds.width > view.x + view.width || bounds.y + bounds.height > view.y + view.height;
    });
    entry.clippedText = clipped.map((text) => text.textContent.trim().slice(0, 60));
    entry.smallestTextPx = texts.length
      ? Number(Math.min(...texts.map((text) => parseFloat(getComputedStyle(text).fontSize) * scale)).toFixed(1))
      : null;
    if (clipped.length) issues.push({ code: "figure-clipped", figure: path, detail: entry.clippedText.join(" | ") });
    if (entry.smallestTextPx !== null && entry.smallestTextPx < 9) issues.push({ code: "figure-illegible", figure: path, detail: entry.smallestTextPx + "px effective" });
    return entry;
  });
  if (viewport.scrollWidth > viewport.clientWidth + 1) issues.push({ code: "note-overflow", detail: viewport.scrollWidth + "px in a " + viewport.clientWidth + "px column" });
  const katexErrors = [...document.querySelectorAll(".katex-error")].map((node) => node.textContent.slice(0, 80));
  for (const error of katexErrors) issues.push({ code: "latex-error", detail: error });
  return {
    page: { width: Math.ceil(document.body.scrollWidth), height: Math.ceil(document.body.scrollHeight) },
    figures,
    issues,
    ok: issues.length === 0,
  };
}

window.__renderComplete = (async () => {
  if (window.mermaid) {
    window.mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
    try { await window.mermaid.run({ querySelector: ".mermaid" }); } catch { /* reported as an unrendered diagram */ }
  }
  await document.fonts.ready;
  await Promise.all([...document.images].map((image) => image.decode().catch(() => {})));
  return measure();
})();
</script>
`;
}

async function buildStage(args) {
  if (!args.vault || !args.note) usage(2);
  const vaultRoot = realpathSync(resolve(args.vault));
  const notePath = resolveInside(vaultRoot, args.note);
  const outDir = resolve(args.out ?? mkdtempSync(join(os.tmpdir(), "violet-render-")));
  mkdirSync(outDir, { recursive: true });

  const [{ unified }, remarkParse, remarkGfm, remarkMath, remarkRehype, rehypeKatex, rehypeStringify, normalization, assets] = await Promise.all([
    import("unified"),
    import("remark-parse"),
    import("remark-gfm"),
    import("remark-math"),
    import("remark-rehype"),
    import("rehype-katex"),
    import("rehype-stringify"),
    import(pathToFileURL(join(projectRoot, "src", "markdown-normalization.ts")).href),
    import(pathToFileURL(join(projectRoot, "electron", "assets.mjs")).href),
  ]);

  const region = sliceRegion(readFileSync(notePath, "utf8").replace(/^---\n[\s\S]*?\n---\n/, ""), args.region);
  const rendered = String(await unified()
    .use(remarkParse.default)
    .use(remarkGfm.default)
    .use(remarkMath.default)
    .use(remarkRehype.default, { allowDangerousHtml: true })
    .use(rehypeKatex.default)
    .use(rehypeStringify.default, { allowDangerousHtml: true })
    .process(normalization.normalizeMarkdownForRendering(region)));

  const withMermaid = rendered.replace(/<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g, '<div class="mermaid">$1</div>');
  const noteHtml = inlineEmbeds(withMermaid, vaultRoot, assets.sanitizeVaultSvg, normalization.parseEmbedDimensions);
  const katexDist = join(projectRoot, "node_modules", "katex", "dist");
  const mermaidBundle = join(projectRoot, "node_modules", "mermaid", "dist", "mermaid.min.js");
  const htmlPath = join(outDir, "harness.html");
  writeFileSync(htmlPath, harnessDocument({
    noteHtml,
    sourceUri: args.source ? dataUri(resolveInside(vaultRoot, args.source)) : null,
    katexCss: embedKatexFonts(readFileSync(join(katexDist, "katex.min.css"), "utf8"), katexDist),
    mermaidScript: withMermaid.includes('class="mermaid"') && existsSync(mermaidBundle) ? readFileSync(mermaidBundle, "utf8") : null,
  }));

  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    throw new Error("No display is available for offscreen rendering; run under the desktop session or xvfb-run.");
  }
  const electronBinary = createRequire(import.meta.url)("electron");
  const capture = spawn(electronBinary, [scriptPath, "--html", htmlPath, "--out", outDir], {
    stdio: ["ignore", "ignore", "pipe"],
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: "1" },
  });
  let stderr = "";
  capture.stderr.on("data", (chunk) => { stderr += chunk; });
  const code = await new Promise((done) => capture.on("close", done));
  if (code !== 0) throw new Error(`Offscreen rendering failed: ${stderr.trim().split("\n").at(-1) ?? code}`);

  const report = JSON.parse(readFileSync(join(outDir, "report.json"), "utf8"));
  process.stdout.write(`Rendered check: ${report.ok ? "PASS" : "FAIL"}; ${report.figures.length} figure(s), ${report.issues.length} issue(s)\n`);
  for (const issue of report.issues) process.stdout.write(`ISSUE ${issue.code}${issue.figure ? ` ${issue.figure}` : ""}${issue.detail ? `: ${issue.detail}` : ""}\n`);
  process.stdout.write(`${join(outDir, "compare.jpg")}\n${join(outDir, "report.json")}\n`);
  if (!report.ok) process.exit(1);
}

async function captureStage(args) {
  const { app, BrowserWindow, screen } = await import("electron");
  app.disableHardwareAcceleration();
  // Offscreen capture needs the in-process compositor; a forced device scale factor breaks it.
  app.commandLine.appendSwitch("in-process-gpu");
  await app.whenReady();
  const offscreen = { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false };

  const measuring = new BrowserWindow({ show: false, width: 1200, height: 900, webPreferences: offscreen });
  await measuring.loadFile(args.html);
  const report = await measuring.webContents.executeJavaScript("window.__renderComplete");

  // A resized offscreen window loses its compositor and the surface cannot exceed the display,
  // so the capture window is created at the measured page size and zoomed to fit.
  const { workAreaSize } = screen.getPrimaryDisplay();
  const zoom = Math.min(1, (workAreaSize.width - 40) / report.page.width, (workAreaSize.height - 40) / report.page.height);
  const capturing = new BrowserWindow({
    show: false,
    width: Math.ceil(report.page.width * zoom),
    height: Math.ceil(report.page.height * zoom),
    webPreferences: { ...offscreen, zoomFactor: zoom },
  });
  await capturing.loadFile(args.html);
  await capturing.webContents.executeJavaScript("window.__renderComplete");
  const shot = await capturing.webContents.capturePage();

  writeFileSync(join(args.out, "compare.jpg"), shot.resize({ width: Math.min(shot.getSize().width, 1100) }).toJPEG(78));
  writeFileSync(join(args.out, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  app.exit(0);
}

if (process.argv[1] === scriptPath) {
  const args = parseArgs(process.argv.slice(2));
  const fail = (error) => {
    process.stderr.write(`render_check: ${error.message}\n`);
    process.exit(2);
  };
  // Awaiting the capture stage at the top level would stall Electron's ESM entry before "ready".
  if (process.versions.electron) captureStage(args).catch(fail);
  else await buildStage(args).catch(fail);
}
