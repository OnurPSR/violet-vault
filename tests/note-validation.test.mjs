import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import LZString from "lz-string";

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
  try {
    const result = await execFileAsync(process.execPath, [validator, "--vault", vault, "--note", note, "--json", path.join(vault, "report.json")]);
    return { code: 0, stdout: result.stdout };
  } catch (error) {
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
}

function validScene() {
  return {
    type: "excalidraw",
    version: 2,
    elements: [{
      id: "box-1",
      type: "rectangle",
      x: 10,
      y: 20,
      width: 200,
      height: 100,
      angle: 0,
      opacity: 100,
      strokeWidth: 2,
      groupIds: [],
      isDeleted: false,
      boundElements: [],
    }],
    files: {},
  };
}

test("validates Markdown and LaTeX through parser ASTs", async (t) => {
  const vault = await fixture(t);
  await writeFile(path.join(vault, "Notes", "Target.md"), "# Target\n\n$\\frac{1}{2}$\n\n[[Other]]\n");
  await writeFile(path.join(vault, "Notes", "Other.md"), "# Other\n");

  const result = await run(vault, "Notes/Target.md");

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Static validation: PASS/);
});

test("fails on a KaTeX parse error", async (t) => {
  const vault = await fixture(t);
  await writeFile(path.join(vault, "Notes", "Target.md"), "# Target\n\n$\\frac{1$\n");

  const result = await run(vault, "Notes/Target.md");

  assert.equal(result.code, 1);
  assert.match(result.stdout, /ERROR latex-parse/);
});

test("rejects a Mermaid block without a recognized diagram directive", async (t) => {
  const vault = await fixture(t);
  await writeFile(path.join(vault, "Notes", "Target.md"), "# Target\n\n```mermaid\nA --> B\n```\n");

  const result = await run(vault, "Notes/Target.md");

  assert.equal(result.code, 1);
  assert.match(result.stdout, /ERROR mermaid-directive/);
});

test("performs detailed Excalidraw scene validation", async (t) => {
  const vault = await fixture(t);
  await writeFile(path.join(vault, "Notes", "Target.md"), "# Target\n\n![[drawing.excalidraw]]\n");
  await writeFile(path.join(vault, "Notes", "drawing.excalidraw"), JSON.stringify(validScene()));

  const valid = await run(vault, "Notes/Target.md");
  assert.equal(valid.code, 0, valid.stderr);

  const broken = validScene();
  broken.elements.push({
    id: "arrow-1",
    type: "arrow",
    x: 0,
    y: 0,
    width: 20,
    height: 20,
    angle: 0,
    opacity: 100,
    strokeWidth: 1,
    groupIds: [],
    isDeleted: false,
    points: [[0, 0], [20, 20]],
    startBinding: { elementId: "missing" },
  });
  await writeFile(path.join(vault, "Notes", "drawing.excalidraw"), JSON.stringify(broken));

  const invalid = await run(vault, "Notes/Target.md");
  assert.equal(invalid.code, 1);
  assert.match(invalid.stdout, /ERROR excalidraw-binding/);
});

test("decodes and validates compressed Excalidraw Markdown payloads", async (t) => {
  const vault = await fixture(t);
  const encoded = LZString.compressToBase64(JSON.stringify(validScene()));
  await writeFile(path.join(vault, "Notes", "Target.md"), "# Target\n\n![[drawing.excalidraw.md]]\n");
  await writeFile(path.join(vault, "Notes", "drawing.excalidraw.md"), `# Drawing\n\n\`\`\`compressed-json\n${encoded}\n\`\`\`\n`);

  const result = await run(vault, "Notes/Target.md");

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Static validation: PASS/);
});
