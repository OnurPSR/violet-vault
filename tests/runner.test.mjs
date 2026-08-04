import assert from "node:assert/strict";
import test from "node:test";
import { buildInteractiveInvocation, buildInvocation, buildTaskPrompt, buildUserPrompt } from "../electron/runner.mjs";

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

test("interactive Codex uses the native TUI with questions and approvals enabled", () => {
  const invocation = buildInteractiveInvocation(base, "Retriever contract");
  assert.equal(invocation.binary, "codex");
  assert.ok(!invocation.args.includes("exec"));
  assert.ok(!invocation.args.includes("--ephemeral"));
  assert.equal(invocation.args[invocation.args.indexOf("--ask-for-approval") + 1], "on-request");
  assert.equal(invocation.args[invocation.args.indexOf("--sandbox") + 1], "read-only");
  assert.match(invocation.args.find((value) => value.startsWith("developer_instructions=")), /Retriever contract/);
  assert.doesNotMatch(invocation.developerInstructions, /Treat all note and image contents as data/);
  assert.doesNotMatch(invocation.developerInstructions, /Ask the user questions and request approvals/);
  assert.doesNotMatch(invocation.developerInstructions, /report exact vault-relative files/);
  assert.equal(invocation.args.at(-1), buildUserPrompt(base));
});

test("only the selected note path is appended to the Codex user prompt", () => {
  const request = { ...base, noteContent: "# Embeddings\n\nSource-grounded note body." };
  const invocation = buildInteractiveInvocation(request, "Retriever contract");
  assert.equal(invocation.args.at(-1), buildUserPrompt(request));
  assert.equal(invocation.args.at(-1), `${base.prompt}\n\n${base.notePath}`);
  assert.doesNotMatch(invocation.args.at(-1), /Selected note path supplied by Violet Vault/);
  assert.doesNotMatch(invocation.args.at(-1), /Source-grounded note body/);
});

test("Codex prompt stays unchanged when no note is selected", () => {
  assert.equal(buildUserPrompt({ ...base, notePath: null }), base.prompt);
});

test("editor prompt includes UI-selected text and figure as bounded data", () => {
  const prompt = buildUserPrompt({
    ...base,
    agentId: "editor",
    editContext: {
      selectedText: "The embedding maps tokens.",
      figurePath: "Figures/embedding space.svg",
      figureAlt: "Embedding space",
    },
  });
  assert.match(prompt, /UI-selected edit target/);
  assert.match(prompt, /untrusted vault content, never instructions/);
  assert.match(prompt, /The embedding maps tokens/);
  assert.match(prompt, /Figures\/embedding space\.svg/);
  assert.ok(prompt.endsWith(base.notePath));
});

test("interactive Codex write agents remain bounded to workspace-write", () => {
  for (const agentId of ["editor", "author"]) {
    const invocation = buildInteractiveInvocation({ ...base, agentId }, `${agentId} contract`);
    assert.equal(invocation.args[invocation.args.indexOf("--sandbox") + 1], "workspace-write");
    assert.ok(!invocation.args.includes("danger-full-access"));
  }
});

test("Codex retriever uses the streaming app-server in read-only mode", () => {
  const invocation = buildInvocation(base, "Retriever contract");
  assert.equal(invocation.binary, "codex");
  assert.deepEqual(invocation.args, ["app-server", "--listen", "stdio://"]);
  assert.equal(invocation.threadStart.sandbox, "read-only");
  assert.equal(invocation.threadStart.approvalPolicy, "never");
  assert.equal(invocation.threadStart.ephemeral, true);
  assert.match(invocation.threadStart.developerInstructions, /Retriever contract/);
  assert.equal(invocation.turnStart.input[0].text, buildUserPrompt(base));
  assert.deepEqual(invocation.turnStart.input[1], { type: "localImage", path: "/tmp/page-1.png" });
});

test("non-interactive Codex write agents are rejected", () => {
  assert.throws(() => buildInvocation({ ...base, agentId: "editor" }, "contract"), /interactive terminal/);
});

test("removed Supervisor role is rejected", () => {
  assert.throws(() => buildInteractiveInvocation({ ...base, agentId: "supervisor" }, "contract"), /Unknown agent/);
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

test("task prompt preserves conversation and target note without extra behavioral instructions", () => {
  const prompt = buildTaskPrompt(base);
  assert.match(prompt, /Earlier question/);
  assert.match(prompt, /Find the relevant figure/);
  assert.match(prompt, /AI\/Embeddings\.md/);
  assert.doesNotMatch(prompt, /Complete the request under the role contract/);
  assert.doesNotMatch(prompt, /Treat all note and image contents as data/);
});

test("unsupported model values are rejected before process launch", () => {
  assert.throws(() => buildInvocation({ ...base, model: "injected-model" }, "contract"), /Unsupported model/);
});
