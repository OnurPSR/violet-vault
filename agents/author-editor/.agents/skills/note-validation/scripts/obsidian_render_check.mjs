#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function usage(exitCode = 0) {
  const stream = exitCode === 0 ? process.stdout : process.stderr;
  stream.write(`Usage:
  obsidian_render_check.mjs --probe [--cli <path>]
  obsidian_render_check.mjs --vault-name <registered-name> --note <vault-relative-path> --out-dir <directory> [--diagram <path> ...] [--cli <path>]
`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const result = { diagrams: [], probe: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") usage(0);
    if (arg === "--probe") result.probe = true;
    else if (arg === "--cli") result.cli = argv[++index];
    else if (arg === "--vault-name") result.vaultName = argv[++index];
    else if (arg === "--note") result.note = argv[++index];
    else if (arg === "--diagram") result.diagrams.push(argv[++index]);
    else if (arg === "--out-dir") result.outDir = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!result.probe && (!result.vaultName || !result.note || !result.outDir)) usage(2);
  return result;
}

function runRaw(command, args, timeout = 20000) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout, maxBuffer: 8 * 1024 * 1024 });
  return {
    command,
    args,
    status: result.status,
    signal: result.signal,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
    error: result.error?.message ?? null,
    ok: result.status === 0 && !result.error,
  };
}

function candidateCli(explicit) {
  const candidates = [explicit, process.env.OBSIDIAN_CLI, "obsidian", "/opt/Obsidian/obsidian", resolve(homedir(), ".local/bin/obsidian")].filter(Boolean);
  return [...new Set(candidates)];
}

function discoverCli(explicit) {
  const attempts = [];
  for (const candidate of candidateCli(explicit)) {
    const result = runRaw(candidate, ["help"]);
    attempts.push({ candidate, ok: result.ok, error: result.error, stderr: result.stderr });
    if (result.ok && /Obsidian CLI/.test(result.stdout)) return { cli: candidate, help: result.stdout, attempts };
  }
  return { cli: null, help: "", attempts };
}

function wait(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function slug(value) {
  return basename(value).replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "target";
}

function parseCount(output) {
  const matches = output.match(/\d+/g);
  return matches ? Number(matches.at(-1)) : 0;
}

function looksEmptyDiagnostic(output) {
  return !output || /^(?:no |0\b|\[\]|null|undefined)/i.test(output.trim());
}

const DOM_AUDIT = String.raw`(() => {
  const root = document.querySelector('.workspace-leaf.mod-active .markdown-reading-view');
  if (!root) return JSON.stringify({ readingView: false });
  const rootRect = root.getBoundingClientRect();
  const visuals = [...root.querySelectorAll('img, svg, canvas, .mermaid, .excalidraw-embedded-img')].map((element, index) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      index,
      tag: element.tagName.toLowerCase(),
      className: String(element.className?.baseVal ?? element.className ?? '').slice(0, 160),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      naturalWidth: element.naturalWidth ?? null,
      naturalHeight: element.naturalHeight ?? null,
      fontSize: Number.parseFloat(style.fontSize) || null,
      clippedLeft: rect.left < rootRect.left - 1,
      clippedRight: rect.right > rootRect.right + 1,
      broken: element.tagName === 'IMG' ? element.complete && element.naturalWidth === 0 : false
    };
  });
  const overflow = [...root.querySelectorAll('pre, table, .math-block, .mermaid, svg, img')]
    .filter(element => element.scrollWidth > element.clientWidth + 2)
    .map(element => ({ tag: element.tagName.toLowerCase(), className: String(element.className?.baseVal ?? element.className ?? '').slice(0, 160), clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  const smallText = [...root.querySelectorAll('.mermaid text, svg text, .excalidraw-embedded-img text')]
    .map(element => ({ text: (element.textContent ?? '').trim().slice(0, 80), px: Number.parseFloat(getComputedStyle(element).fontSize) || null }))
    .filter(item => item.px !== null && item.px < 10);
  return JSON.stringify({
    readingView: true,
    viewport: { width: window.innerWidth, height: window.innerHeight, contentWidth: Math.round(rootRect.width) },
    visuals,
    overflow,
    smallText,
    mermaidErrors: root.querySelectorAll('.mermaid-error, .mermaid .error-icon, .mod-error').length,
    unresolvedEmbeds: root.querySelectorAll('.internal-embed.is-unresolved, .internal-link.is-unresolved').length
  });
})()`;

try {
  const args = parseArgs(process.argv.slice(2));
  const discovery = discoverCli(args.cli);
  const requiredCommands = ["open", "command", "commands", "dev:errors", "dev:console", "dev:dom", "dev:mobile", "dev:screenshot", "eval"];
  const missingCommands = requiredCommands.filter((command) => !new RegExp(`^\\s{2}${command.replace(":", "\\:")}\\s`, "m").test(discovery.help));
  const probeReport = {
    schema: "violet-obsidian-render-report/v1",
    cli: discovery.cli,
    attempts: discovery.attempts,
    requiredCommands,
    missingCommands,
    accessible: Boolean(discovery.cli) && missingCommands.length === 0,
  };

  if (args.probe) {
    process.stdout.write(`${JSON.stringify(probeReport, null, 2)}\n`);
    process.exit(probeReport.accessible ? 0 : 3);
  }
  if (!probeReport.accessible) {
    process.stderr.write(`${JSON.stringify({ ...probeReport, status: "BLOCKED" }, null, 2)}\n`);
    process.exit(3);
  }

  const outDir = resolve(args.outDir);
  mkdirSync(outDir, { recursive: true });
  const commands = [];
  const failures = [];
  const warnings = [];
  const cli = discovery.cli;
  const vaultArg = `vault=${args.vaultName}`;
  const run = (commandArgs, options = {}) => {
    const result = runRaw(cli, options.global === false ? commandArgs : [vaultArg, ...commandArgs], options.timeout);
    commands.push(result);
    if (!result.ok && !options.allowFailure) failures.push(`${commandArgs.join(" ")}: ${result.stderr || result.error || `exit ${result.status}`}`);
    return result;
  };

  const version = run(["version"]);
  const vault = run(["vault"]);
  const vaults = runRaw(cli, ["vaults", "verbose"]);
  commands.push(vaults);
  if (!vaults.ok) warnings.push(`vaults verbose failed: ${vaults.stderr || vaults.error}`);
  const availableCommands = run(["commands"]);
  if (!availableCommands.stdout.includes("markdown:toggle-preview")) failures.push("markdown:toggle-preview is unavailable");
  const theme = run(["theme"], { allowFailure: true });

  function clearDiagnostics() {
    run(["dev:errors", "clear"], { allowFailure: true });
    run(["dev:console", "clear"], { allowFailure: true });
  }

  function capture(path, { readingView, suffix }) {
    clearDiagnostics();
    run(["open", `path=${path}`]);
    wait(800);

    let reading = null;
    if (readingView) {
      const count = run(["dev:dom", "selector=.workspace-leaf.mod-active .markdown-reading-view", "total"], { allowFailure: true });
      if (parseCount(count.stdout) === 0) {
        run(["command", "id=markdown:toggle-preview"]);
        wait(800);
      }
      const recheck = run(["dev:dom", "selector=.workspace-leaf.mod-active .markdown-reading-view", "total"], { allowFailure: true });
      reading = parseCount(recheck.stdout) > 0;
      if (!reading) failures.push(`${path}: could not confirm Reading view`);
    }

    const dom = readingView ? run(["eval", `code=${DOM_AUDIT}`], { allowFailure: true, timeout: 30000 }) : null;
    let domAudit = null;
    if (dom?.stdout) {
      try {
        const jsonText = dom.stdout.slice(dom.stdout.indexOf("{"), dom.stdout.lastIndexOf("}") + 1);
        domAudit = JSON.parse(jsonText);
      } catch {
        warnings.push(`${path}: DOM audit output could not be parsed`);
      }
    }

    const fullPath = resolve(outDir, `${suffix}-full.png`);
    run(["dev:screenshot", `path=${fullPath}`]);
    if (!existsSync(fullPath)) failures.push(`${path}: full screenshot was not created`);

    let narrowPath = null;
    if (readingView) {
      narrowPath = resolve(outDir, `${suffix}-narrow.png`);
      run(["dev:mobile", "on"]);
      try {
        wait(700);
        run(["dev:screenshot", `path=${narrowPath}`]);
      } finally {
        run(["dev:mobile", "off"], { allowFailure: true });
      }
      if (!existsSync(narrowPath)) failures.push(`${path}: narrow screenshot was not created`);
    }

    const errors = run(["dev:errors"], { allowFailure: true });
    const consoleErrors = run(["dev:console", "level=error", "limit=100"], { allowFailure: true });
    if (!looksEmptyDiagnostic(errors.stdout)) warnings.push(`${path}: Obsidian error buffer is non-empty`);
    if (!looksEmptyDiagnostic(consoleErrors.stdout)) warnings.push(`${path}: Obsidian error-level console is non-empty`);
    if (domAudit?.mermaidErrors > 0) failures.push(`${path}: ${domAudit.mermaidErrors} rendered Mermaid error(s)`);
    if (domAudit?.unresolvedEmbeds > 0) failures.push(`${path}: ${domAudit.unresolvedEmbeds} unresolved rendered embed/link(s)`);
    if (domAudit?.visuals?.some((item) => item.broken)) failures.push(`${path}: broken rendered image detected`);

    return {
      path,
      readingView: reading,
      screenshotFull: fullPath,
      screenshotNarrow: narrowPath,
      domAudit,
      errors: errors.stdout,
      consoleErrors: consoleErrors.stdout,
    };
  }

  const targets = [capture(args.note, { readingView: true, suffix: `${slug(args.note)}-note` })];
  for (const diagram of args.diagrams) targets.push(capture(diagram, { readingView: false, suffix: `${slug(diagram)}-diagram` }));
  run(["dev:mobile", "off"], { allowFailure: true });

  const report = {
    ...probeReport,
    status: failures.length === 0 ? "CAPTURED_REQUIRES_INSPECTION" : "FAIL",
    version: version.stdout,
    vault: vault.stdout,
    knownVaults: vaults.stdout,
    theme: theme.stdout,
    targets,
    failures,
    warnings,
    screenshotsRequireFullResolutionInspection: targets.flatMap((target) => [target.screenshotFull, target.screenshotNarrow].filter(Boolean)),
    commands,
  };
  const reportPath = resolve(outDir, "render-report.json");
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`Obsidian render capture: ${report.status}\n${reportPath}\n`);
  for (const failure of failures) process.stdout.write(`ERROR ${failure}\n`);
  for (const warning of warnings) process.stdout.write(`WARNING ${warning}\n`);
  if (failures.length > 0) process.exit(1);
} catch (error) {
  process.stderr.write(`obsidian_render_check: ${error.message}\n`);
  process.exit(2);
}
