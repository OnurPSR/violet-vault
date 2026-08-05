import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadAgentInstructions } from "../electron/instructions.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUTHOR_CONTRACT_BUDGET_BYTES = 8 * 1024;

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
  const skillDirectory = path.join(root, "agents", "retriever", "skills", "example-skill");
  await mkdir(skillDirectory, { recursive: true });
  await writeFile(path.join(skillDirectory, "SKILL.md"), "---\nname: example-skill\n---\n");

  const instructions = await loadAgentInstructions(root, "retriever");

  assert.match(instructions, /# Available agent skills/);
  assert.match(instructions, new RegExp(`- example-skill: ${path.join(skillDirectory, "SKILL.md")}`));
});

test("a skills directory without a manifest is ignored", async (context) => {
  const root = await fixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "agents", "retriever", "skills", "draft"), { recursive: true });

  const instructions = await loadAgentInstructions(root, "retriever");

  assert.equal(instructions, "# Retriever\n\nUse read-only access.");
});

test("the author contract stays small enough to be a durable root contract", async () => {
  const contract = path.join(projectRoot, "agents", "author", "AGENTS.md");
  const { size } = await stat(contract);

  assert.ok(
    size < AUTHOR_CONTRACT_BUDGET_BYTES,
    `agents/author/AGENTS.md is ${size} bytes; keep it under ${AUTHOR_CONTRACT_BUDGET_BYTES}. Move procedure into the skill.`,
  );
});

test("the author contract points at a skill that actually exists", async () => {
  const contract = await readFile(path.join(projectRoot, "agents", "author", "AGENTS.md"), "utf8");
  assert.match(contract, /skills\/handwritten-note-author\/SKILL\.md/);

  const instructions = await loadAgentInstructions(projectRoot, "author");
  assert.match(instructions, /- handwritten-note-author: .*SKILL\.md/);
});
