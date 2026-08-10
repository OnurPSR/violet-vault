#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

function usage(exitCode = 0) {
  const stream = exitCode === 0 ? process.stdout : process.stderr;
  stream.write(
    "Usage: capture_baseline.mjs --vault <root> --out <snapshot.json> --file <vault-relative-path> [--file <path> ...]\n",
  );
  process.exit(exitCode);
}

function parseArgs(argv) {
  const result = { files: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") usage(0);
    if (arg === "--file") result.files.push(argv[++index]);
    else if (arg === "--vault") result.vault = argv[++index];
    else if (arg === "--out") result.out = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!result.vault || !result.out || result.files.length === 0) usage(2);
  return result;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function resolveInside(root, requestedPath) {
  if (!requestedPath || isAbsolute(requestedPath)) {
    throw new Error(`Expected a vault-relative path: ${requestedPath}`);
  }
  const absolute = resolve(root, requestedPath);
  if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) {
    throw new Error(`Path escapes the vault: ${requestedPath}`);
  }
  if (existsSync(absolute)) {
    const real = realpathSync(absolute);
    if (real !== root && !real.startsWith(`${root}${sep}`)) {
      throw new Error(`Symlink escapes the vault: ${requestedPath}`);
    }
  }
  return absolute;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const vaultRoot = realpathSync(resolve(args.vault));
  if (!statSync(vaultRoot).isDirectory()) throw new Error("Vault root is not a directory");

  const seen = new Set();
  const files = args.files.map((requestedPath) => {
    const absolute = resolveInside(vaultRoot, requestedPath);
    const vaultPath = relative(vaultRoot, absolute).split(sep).join("/");
    if (seen.has(vaultPath)) throw new Error(`Duplicate --file path: ${vaultPath}`);
    seen.add(vaultPath);

    if (!existsSync(absolute)) return { path: vaultPath, exists: false };
    if (!statSync(absolute).isFile()) throw new Error(`Not a file: ${vaultPath}`);
    const content = readFileSync(absolute);
    return {
      path: vaultPath,
      exists: true,
      bytes: content.length,
      sha256: sha256(content),
      contentBase64: content.toString("base64"),
    };
  });

  const snapshot = {
    schema: "violet-note-baseline/v1",
    createdAt: new Date().toISOString(),
    vaultRoot,
    files,
  };
  const outputPath = resolve(args.out);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(
    `Captured ${files.length} path(s): ${files.filter((file) => file.exists).length} existing, ${files.filter((file) => !file.exists).length} absent\n${outputPath}\n`,
  );
} catch (error) {
  process.stderr.write(`capture_baseline: ${error.message}\n`);
  process.exit(1);
}
