import assert from "node:assert/strict";
import test from "node:test";
import { cleanState, MAX_STATE_BYTES, MAX_TERMINAL_TRANSCRIPT_CHARS, serializeStateWithinBudget } from "../electron/state-storage.mjs";

function conversation(id, transcript = "") {
  return {
    id,
    title: `Conversation ${id}`,
    agent: "author-editor",
    provider: "codex",
    model: "gpt-5.6-sol",
    effort: "high",
    messages: [{ id: `message-${id}`, role: "user", content: "hello", createdAt: 1 }],
    terminalTranscript: transcript,
    updatedAt: 1,
  };
}

test("keeps the recent tail of oversized terminal transcripts", () => {
  const transcript = `begin-${"x".repeat(MAX_TERMINAL_TRANSCRIPT_CHARS)}-important-tail`;
  const cleaned = cleanState({ conversations: [conversation("one", transcript)] });
  assert.ok(cleaned.conversations[0].terminalTranscript.length <= MAX_TERMINAL_TRANSCRIPT_CHARS);
  assert.match(cleaned.conversations[0].terminalTranscript, /Earlier terminal output omitted/);
  assert.ok(cleaned.conversations[0].terminalTranscript.endsWith("important-tail"));
});

test("compacts many large conversations instead of rejecting state saves", () => {
  const conversations = Array.from({ length: 20 }, (_, index) => conversation(String(index), "x".repeat(MAX_TERMINAL_TRANSCRIPT_CHARS)));
  const serialized = serializeStateWithinBudget({ conversations });
  const restored = JSON.parse(serialized);
  assert.ok(Buffer.byteLength(serialized) <= MAX_STATE_BYTES);
  assert.equal(restored.conversations[0].id, "0");
  assert.ok(restored.conversations.length > 0);
  assert.ok(restored.conversations.filter((item) => item.terminalTranscript).length < conversations.length);
  assert.equal(restored.conversations.at(-1).terminalTranscript, undefined);
});

test("visual verification defaults on and preserves an explicit off setting", () => {
  assert.equal(cleanState({}).visualVerification, true);
  assert.equal(cleanState({ visualVerification: false }).visualVerification, false);
});
