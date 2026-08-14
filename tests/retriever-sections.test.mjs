import assert from "node:assert/strict";
import test from "node:test";
import { splitRetrieverResponse } from "../src/retriever-sections.ts";

test("retriever response separates note evidence from agent explanation", () => {
  assert.deepEqual(splitRetrieverResponse(`Direct answer.\n\n## From the note\n\nEvidence from AI/Attention.md.\n\n## Agent explanation\n\nThis is domain context.`), [
    { kind: "direct", content: "Direct answer." },
    { kind: "note", content: "Evidence from AI/Attention.md." },
    { kind: "explanation", content: "This is domain context." },
  ]);
});

test("retriever headings inside fenced examples stay ordinary content", () => {
  const content = `## From the note\n\n\`\`\`markdown\n## Agent explanation\n\`\`\``;
  assert.deepEqual(splitRetrieverResponse(content), [
    { kind: "note", content: "```markdown\n## Agent explanation\n```" },
  ]);
});
