import assert from "node:assert/strict";
import test from "node:test";
import { extractTerminalTokenUsage, normalizeCodexUsage, parseClaudeRunOutput } from "../electron/token-usage.mjs";

test("normalizes the last Codex turn usage from app-server notifications", () => {
  const usage = normalizeCodexUsage({
    total: { totalTokens: 999 },
    last: {
      totalTokens: 1_550,
      inputTokens: 1_300,
      cachedInputTokens: 800,
      cacheWriteInputTokens: 0,
      outputTokens: 250,
      reasoningOutputTokens: 120,
    },
    modelContextWindow: 200_000,
  });
  assert.deepEqual(usage, {
    provider: "codex",
    totalTokens: 1_550,
    inputTokens: 1_300,
    cachedInputTokens: 800,
    cacheWriteInputTokens: 0,
    outputTokens: 250,
    reasoningOutputTokens: 120,
    modelContextWindow: 200_000,
  });
});

test("extracts Claude JSON output and includes cached prompt tokens in input consumption", () => {
  const result = parseClaudeRunOutput(JSON.stringify({
    type: "result",
    result: "Completed response",
    usage: {
      input_tokens: 100,
      cache_creation_input_tokens: 20,
      cache_read_input_tokens: 400,
      output_tokens: 80,
    },
  }));
  assert.equal(result.output, "Completed response");
  assert.deepEqual(result.tokenUsage, {
    provider: "claude",
    totalTokens: 600,
    inputTokens: 520,
    cachedInputTokens: 400,
    cacheWriteInputTokens: 20,
    outputTokens: 80,
    reasoningOutputTokens: 0,
    modelContextWindow: null,
  });
});

test("falls back to plain Claude output when an older CLI does not return JSON", () => {
  assert.deepEqual(parseClaudeRunOutput("Plain response\n"), { output: "Plain response", tokenUsage: null });
});

test("extracts a best-effort token summary from an interactive Codex transcript", () => {
  const usage = extractTerminalTokenUsage("Done.\nToken usage: total=2,400 input=2,000 cached input=1,200 output=400\n");
  assert.equal(usage.totalTokens, 2_400);
  assert.equal(usage.inputTokens, 2_000);
  assert.equal(usage.cachedInputTokens, 1_200);
  assert.equal(usage.outputTokens, 400);
  assert.equal(usage.modelContextWindow, null);
});

test("falls back to the Codex status box when the transcript has no labelled usage line", () => {
  const usage = extractTerminalTokenUsage([
    "│  Model:                gpt-5.6-sol (reasoning high, summaries auto)             │",
    "│  Context window:       88% left (30.1K used / 258K)                             │",
    "│  Context window:       69% left (87.6K used / 258K)                             │",
    "│  Weekly limit:         [██████████░░░░░░░░░░] 51% left (resets 00:34 on 21 Aug)  │",
  ].join("\n"));
  assert.equal(usage.totalTokens, 87_600);
  assert.equal(usage.modelContextWindow, 258_000);
  assert.equal(usage.inputTokens, 0);
  assert.equal(usage.outputTokens, 0);
});

test("prefers a labelled usage line over the status box", () => {
  const usage = extractTerminalTokenUsage([
    "  Context window:       69% left (87.6K used / 258K)",
    "Token usage: total=2,400 input=2,000 output=400",
  ].join("\n"));
  assert.equal(usage.totalTokens, 2_400);
  assert.equal(usage.modelContextWindow, 258_000);
});
