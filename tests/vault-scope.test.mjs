import assert from "node:assert/strict";
import test from "node:test";
import { auditVaultChanges, authorizedWritePaths, formatScopeWarning } from "../electron/vault-scope.mjs";

test("author write scope includes only the selected note, its attachment directory, and selected figure", () => {
  const allowed = authorizedWritePaths({
    agentId: "author-editor",
    notePath: "Courses/Calculus.md",
    editContext: { figurePath: "Shared/axis.svg" },
  });
  assert.deepEqual(allowed, [
    { kind: "file", path: "Courses/Calculus.md" },
    { kind: "directory", path: "attachments/Calculus/" },
    { kind: "file", path: "Shared/axis.svg" },
  ]);
});

test("scope audit reports only changes outside authorized paths", () => {
  const before = new Map([
    ["Courses/Calculus.md", "10:1"],
    ["Other.md", "10:1"],
  ]);
  const after = new Map([
    ["Courses/Calculus.md", "20:2"],
    ["attachments/Calculus/notes/page-1.png", "30:2"],
    ["Other.md", "11:2"],
  ]);
  const changed = auditVaultChanges(before, after, authorizedWritePaths({ agentId: "author-editor", notePath: "Courses/Calculus.md" }));
  assert.deepEqual(changed, ["Other.md"]);
  assert.match(formatScopeWarning(changed), /Other\.md/);
});
