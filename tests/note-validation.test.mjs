import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validator = path.join(projectRoot, "agents", "author-editor", ".agents", "skills", "note-validation", "scripts", "validate_note.mjs");

async function fixture(t) {
  const vault = await mkdtemp(path.join(os.tmpdir(), "violet-validation-"));
  t.after(() => rm(vault, { recursive: true, force: true }));
  await mkdir(path.join(vault, "Notes"));
  return vault;
}

async function run(vault, note) {
  const reportPath = path.join(vault, "report.json");
  try {
    const result = await execFileAsync(process.execPath, [validator, "--vault", vault, "--note", note, "--json", reportPath]);
    return { code: 0, stdout: result.stdout, report: JSON.parse(await readFile(reportPath, "utf8")) };
  } catch (error) {
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
}

test("validates Markdown and LaTeX through parser ASTs", async (t) => {
  const vault = await fixture(t);
  await writeFile(path.join(vault, "Notes", "Target.md"), "# Target\n\n$\\frac{1}{2}$\n\n[[Other]]\n");
  await writeFile(path.join(vault, "Notes", "Other.md"), "# Other\n");

  const result = await run(vault, "Notes/Target.md");

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Structural validation: PASS/);
});

test("fails on a KaTeX parse error", async (t) => {
  const vault = await fixture(t);
  await writeFile(path.join(vault, "Notes", "Target.md"), "# Target\n\n$\\frac{1$\n");

  const result = await run(vault, "Notes/Target.md");

  assert.equal(result.code, 1);
  assert.match(result.stdout, /ERROR latex-parse/);
});

test("records Mermaid figures without statically validating their contents", async (t) => {
  const vault = await fixture(t);
  await writeFile(path.join(vault, "Notes", "Target.md"), "# Target\n\n```mermaid\nA --> B\n```\n");

  const result = await run(vault, "Notes/Target.md");

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.report.summary.figureReferences, 1);
  assert.deepEqual(result.report.figures, [{ kind: "mermaid", line: 3 }]);
});

test("records embedded figures without statically inspecting their contents", async (t) => {
  const vault = await fixture(t);
  await writeFile(path.join(vault, "Notes", "Target.md"), "# Target\n\n![[drawing.excalidraw]]\n");
  await writeFile(path.join(vault, "Notes", "drawing.excalidraw"), "not a valid drawing");

  const result = await run(vault, "Notes/Target.md");
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.report.figures[0].kind, "excalidraw");
});

test("still rejects a missing figure embed as a structural error", async (t) => {
  const vault = await fixture(t);
  await writeFile(path.join(vault, "Notes", "Target.md"), "# Target\n\n![[missing.svg]]\n");

  const result = await run(vault, "Notes/Target.md");

  assert.equal(result.code, 1);
  assert.match(result.stdout, /ERROR attachment-missing/);
});
