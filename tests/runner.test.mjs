import assert from "node:assert/strict";
import test from "node:test";
import { buildInvocation, buildTaskPrompt } from "../electron/runner.mjs";

const base = {
  agentId: "retriever",
  provider: "codex",
  model: "gpt-5.6-sol",
  effort: "high",
  vaultPath: "/vault",
  notePath: "AI/Embeddings.md",
  messages: [{ role: "user", content: "Earlier question" }],
  prompt: "Find the relevant figure",
  images: ["/tmp/page-1.png"],
};

test("retriever uses an ephemeral, read-only Codex run", () => {
  const invocation = buildInvocation(base, "Retriever contract");
  assert.equal(invocation.binary, "codex");
  assert.deepEqual(invocation.args.slice(0, 7), ["exec", "--ephemeral", "--skip-git-repo-check", "--cd", "/vault", "--sandbox", "read-only"]);
  assert.ok(invocation.args.includes("--image"));
  assert.ok(invocation.args.includes("gpt-5.6-sol"));
  assert.match(invocation.args.at(-1), /AI\/Embeddings\.md/);
});

test("write agents are bounded to Codex workspace-write", () => {
  for (const agentId of ["editor", "author", "supervisor"]) {
    const invocation = buildInvocation({ ...base, agentId }, `${agentId} contract`);
    const sandboxIndex = invocation.args.indexOf("--sandbox");
    assert.equal(invocation.args[sandboxIndex + 1], "workspace-write");
    assert.ok(!invocation.args.includes("danger-full-access"));
  }
});

test("Claude retriever uses plan mode and staged image access", () => {
  const invocation = buildInvocation({
    ...base,
    provider: "claude",
    model: "claude-opus-5",
    images: ["/tmp/violet-vault/page.png"],
    imageDirectories: ["/tmp/violet-vault"],
  }, "Retriever contract");
  assert.equal(invocation.binary, "claude");
  assert.equal(invocation.args[invocation.args.indexOf("--permission-mode") + 1], "plan");
  assert.equal(invocation.args[invocation.args.indexOf("--effort") + 1], "high");
  assert.ok(invocation.args.includes("--add-dir"));
  assert.match(invocation.args.at(-1), /page\.png/);
});

test("task prompt preserves conversation, target note, and role contract", () => {
  const prompt = buildTaskPrompt(base, "STRICT ROLE CONTRACT");
  assert.match(prompt, /STRICT ROLE CONTRACT/);
  assert.match(prompt, /Earlier question/);
  assert.match(prompt, /Find the relevant figure/);
  assert.match(prompt, /AI\/Embeddings\.md/);
});

test("unsupported model values are rejected before process launch", () => {
  assert.throws(() => buildInvocation({ ...base, model: "injected-model" }, "contract"), /Unsupported model/);
});
