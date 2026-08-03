import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadAgentInstructions } from "../electron/instructions.mjs";

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
