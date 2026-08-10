#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";

function usage(exitCode = 0) {
  const stream = exitCode === 0 ? process.stdout : process.stderr;
  stream.write(`Usage:
  validate_change_scope.mjs --snapshot <baseline.json> --vault <root> --target <path> --mode append
  validate_change_scope.mjs --snapshot <baseline.json> --vault <root> --target <path> --mode insert --offset <byte>
  validate_change_scope.mjs --snapshot <baseline.json> --vault <root> --target <path> --mode edit --range <start:end> [--range ...]

Optional: --allow-new <snapshotted-path> --allow-change <snapshotted-path> --json <report.json>
`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const result = { ranges: [], allowNew: new Set(), allowChange: new Set() };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") usage(0);
    if (arg === "--snapshot") result.snapshot = argv[++index];
    else if (arg === "--vault") result.vault = argv[++index];
    else if (arg === "--target") result.target = normalizePath(argv[++index]);
    else if (arg === "--mode") result.mode = argv[++index];
    else if (arg === "--offset") result.offset = parseOffset(argv[++index], "offset");
    else if (arg === "--range") result.ranges.push(parseRange(argv[++index]));
    else if (arg === "--allow-new") result.allowNew.add(normalizePath(argv[++index]));
    else if (arg === "--allow-change") result.allowChange.add(normalizePath(argv[++index]));
    else if (arg === "--json") result.json = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!result.snapshot || !result.vault || !result.target || !result.mode) usage(2);
  if (!new Set(["append", "insert", "edit"]).has(result.mode)) {
    throw new Error(`Unsupported mode: ${result.mode}`);
  }
  if (result.mode === "insert" && result.offset === undefined) usage(2);
  if (result.mode === "edit" && result.ranges.length === 0) usage(2);
  return result;
}

function normalizePath(value) {
  if (!value || isAbsolute(value)) throw new Error(`Expected a vault-relative path: ${value}`);
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function parseOffset(value, label) {
  if (!/^\d+$/.test(value ?? "")) throw new Error(`Invalid ${label}: ${value}`);
  return Number(value);
}

function parseRange(value) {
  const match = /^(\d+):(\d+)$/.exec(value ?? "");
  if (!match) throw new Error(`Invalid range: ${value}`);
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (end < start) throw new Error(`Range ends before it starts: ${value}`);
  return { start, end };
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function absoluteInside(root, vaultPath) {
  const absolute = resolve(root, vaultPath);
  if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) {
    throw new Error(`Path escapes the vault: ${vaultPath}`);
  }
  return absolute;
}

function mergeRanges(ranges, length) {
  const sorted = [...ranges].sort((left, right) => left.start - right.start || left.end - right.end);
  const merged = [];
  for (const range of sorted) {
    if (range.start > length || range.end > length) {
      throw new Error(`Authorized range ${range.start}:${range.end} exceeds original ${length}-byte file`);
    }
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

function verifyProtectedChunks(original, current, ranges) {
  const protectedChunks = [];
  let cursor = 0;
  for (const range of ranges) {
    protectedChunks.push(original.subarray(cursor, range.start));
    cursor = range.end;
  }
  protectedChunks.push(original.subarray(cursor));

  if (!current.subarray(0, protectedChunks[0].length).equals(protectedChunks[0])) {
    return { ok: false, reason: "Protected prefix changed" };
  }

  let currentCursor = protectedChunks[0].length;
  for (let index = 1; index < protectedChunks.length - 1; index += 1) {
    const chunk = protectedChunks[index];
    if (chunk.length === 0) continue;
    const foundAt = current.indexOf(chunk, currentCursor);
    if (foundAt === -1) return { ok: false, reason: `Protected region ${index} changed or disappeared` };
    currentCursor = foundAt + chunk.length;
  }

  const suffix = protectedChunks.at(-1);
  if (!current.subarray(current.length - suffix.length).equals(suffix)) {
    return { ok: false, reason: "Protected suffix changed" };
  }
  if (current.length - suffix.length < currentCursor) {
    return { ok: false, reason: "Protected regions changed order" };
  }
  return { ok: true };
}

try {
  const args = parseArgs(process.argv.slice(2));
  const snapshot = JSON.parse(readFileSync(resolve(args.snapshot), "utf8"));
  if (snapshot.schema !== "violet-note-baseline/v1" || !Array.isArray(snapshot.files)) {
    throw new Error("Unsupported or malformed snapshot");
  }
  const vaultRoot = realpathSync(resolve(args.vault));
  const errors = [];
  const checks = [];
  const targetEntry = snapshot.files.find((file) => file.path === args.target);
  if (!targetEntry?.exists) throw new Error(`Target was not captured as an existing file: ${args.target}`);

  for (const entry of snapshot.files) {
    const absolute = absoluteInside(vaultRoot, entry.path);
    const existsNow = existsSync(absolute);
    if (entry.path === args.target) continue;
    if (!entry.exists && !existsNow) {
      checks.push({ path: entry.path, status: "unchanged-absent" });
      continue;
    }
    if (!entry.exists && existsNow && args.allowNew.has(entry.path)) {
      checks.push({ path: entry.path, status: "authorized-new" });
      continue;
    }
    if (!entry.exists && existsNow) {
      errors.push(`Unexpected new snapshotted file: ${entry.path}`);
      continue;
    }
    if (entry.exists && !existsNow) {
      errors.push(`Snapshotted file was removed: ${entry.path}`);
      continue;
    }
    const current = readFileSync(absolute);
    if (sha256(current) === entry.sha256) checks.push({ path: entry.path, status: "unchanged" });
    else if (args.allowChange.has(entry.path)) checks.push({ path: entry.path, status: "authorized-change" });
    else errors.push(`Protected snapshotted file changed: ${entry.path}`);
  }

  const original = Buffer.from(targetEntry.contentBase64, "base64");
  const current = readFileSync(absoluteInside(vaultRoot, args.target));
  let ranges = args.ranges;
  if (args.mode === "append") ranges = [{ start: original.length, end: original.length }];
  if (args.mode === "insert") ranges = [{ start: args.offset, end: args.offset }];
  ranges = mergeRanges(ranges, original.length);
  const protectedResult = verifyProtectedChunks(original, current, ranges);
  if (!protectedResult.ok) errors.push(`${args.target}: ${protectedResult.reason}`);
  else checks.push({ path: args.target, status: `${args.mode}-scope-preserved`, ranges });

  const report = {
    schema: "violet-change-scope-report/v1",
    snapshot: resolve(args.snapshot),
    vaultRoot,
    target: args.target,
    mode: args.mode,
    originalBytes: original.length,
    currentBytes: current.length,
    checks,
    errors,
    ok: errors.length === 0,
  };
  const rendered = `${JSON.stringify(report, null, 2)}\n`;
  if (args.json) {
    const output = resolve(args.json);
    const { mkdirSync, writeFileSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, rendered);
  }
  process.stdout.write(rendered);
  if (!report.ok) process.exit(1);
} catch (error) {
  process.stderr.write(`validate_change_scope: ${error.message}\n`);
  process.exit(2);
}
