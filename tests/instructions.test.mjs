import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadAgentInstructions } from "../electron/instructions.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUTHOR_CONTRACT_BUDGET_BYTES = 8 * 1024;
const RETRIEVER_CONTRACT_BUDGET_BYTES = 3 * 1024;

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "violet-instructions-"));
  await mkdir(path.join(root, "agents", "retriever"), { recursive: true });
  await writeFile(
    path.join(root, "agents", "retriever", "AGENTS.md"),
    "Read and follow ../shared/AGENTS.md first.\n\n# Retriever\n\nUse read-only access.\n",
  );
  return root;
}

test("a specialist contract loads when shared AGENTS.md is absent", async (context) => {
  const root = await fixture();
  context.after(() => rm(root, { recursive: true, force: true }));

  const instructions = await loadAgentInstructions(root, "retriever");

  assert.equal(instructions, "# Retriever\n\nUse read-only access.");
  assert.doesNotMatch(instructions, /shared\/AGENTS\.md/);
});

test("shared instructions are prepended when the optional file exists", async (context) => {
  const root = await fixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "agents", "shared"), { recursive: true });
  await writeFile(path.join(root, "agents", "shared", "AGENTS.md"), "# Shared\n\nCommon rule.\n");

  const instructions = await loadAgentInstructions(root, "retriever");

  assert.equal(instructions, "# Shared\n\nCommon rule.\n\n# Retriever\n\nUse read-only access.");
});

test("unknown agents are rejected before reading files", async () => {
  await assert.rejects(() => loadAgentInstructions("/unused", "supervisor"), /Unknown agent selection/);
});

test("bundled skills are advertised with absolute paths", async (context) => {
  const root = await fixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  const skillDirectory = path.join(root, "agents", "retriever", ".agents", "skills", "example-skill");
  await mkdir(skillDirectory, { recursive: true });
  await writeFile(path.join(skillDirectory, "SKILL.md"), "---\nname: example-skill\n---\n");

  const instructions = await loadAgentInstructions(root, "retriever");

  assert.match(instructions, /# Available agent skills/);
  assert.match(instructions, new RegExp(`- example-skill: ${path.join(skillDirectory, "SKILL.md")}`));
});

test("a skills directory without a manifest is ignored", async (context) => {
  const root = await fixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "agents", "retriever", ".agents", "skills", "draft"), { recursive: true });

  const instructions = await loadAgentInstructions(root, "retriever");

  assert.equal(instructions, "# Retriever\n\nUse read-only access.");
});

test("the author-editor contract stays small enough to be a durable root contract", async () => {
  const contract = path.join(projectRoot, "agents", "author-editor", "AGENTS.md");
  const { size } = await stat(contract);

  assert.ok(
    size < AUTHOR_CONTRACT_BUDGET_BYTES,
    `agents/author-editor/AGENTS.md is ${size} bytes; keep it under ${AUTHOR_CONTRACT_BUDGET_BYTES}. Move procedure into the skills.`,
  );
});

test("the author-editor contract points at skills that actually exist", async () => {
  const contract = await readFile(path.join(projectRoot, "agents", "author-editor", "AGENTS.md"), "utf8");
  assert.match(contract, /\.agents\/skills\/handwritten-note-reconstruction\/SKILL\.md/);

  const instructions = await loadAgentInstructions(projectRoot, "author-editor");
  assert.match(instructions, /- handwritten-note-reconstruction: .*SKILL\.md/);
  assert.match(instructions, /- note-editing: .*SKILL\.md/);
  assert.match(instructions, /- note-validation: .*SKILL\.md/);
  assert.match(instructions, /- plain-note-authoring: .*SKILL\.md/);
});

test("the retriever contract is compact and defines the UI provenance headings", async () => {
  const contractPath = path.join(projectRoot, "agents", "retriever", "AGENTS.md");
  const [contract, metadata] = await Promise.all([readFile(contractPath, "utf8"), stat(contractPath)]);

  assert.ok(metadata.size < RETRIEVER_CONTRACT_BUDGET_BYTES);
  assert.match(contract, /read-only agent/i);
  assert.match(contract, /First understand the relevant note/);
  assert.match(contract, /When the interface provides a selected note, read that exact note first/);
  assert.match(contract, /When the user highlights a passage in the rendered note/);
  assert.match(contract, /When a figure materially supports the answer, show the original figure/);
  assert.match(contract, /Write mathematics as `\$\.\.\.\$` for inline math/);
  assert.match(contract, /opening and closing `\$\$` on their own lines/);
  assert.match(contract, /^## From the note$/m);
  assert.match(contract, /^## Agent explanation$/m);
});
