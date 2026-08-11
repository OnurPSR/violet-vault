import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fingerprintText, validateEditContextRevision } from "../electron/edit-context.mjs";

test("accepts an exact selection captured from the current note revision", async (t) => {
  const vaultPath = await mkdtemp(path.join(os.tmpdir(), "violet-edit-context-"));
  t.after(() => rm(vaultPath, { recursive: true, force: true }));
  await mkdir(path.join(vaultPath, "Notes"));
  const content = "# Target\n\nSelected sentence.\n";
  await writeFile(path.join(vaultPath, "Notes", "Target.md"), content);
  const start = content.indexOf("Selected sentence.");
  const request = {
    agentId: "author-editor",
    vaultPath,
    notePath: "Notes/Target.md",
    editContext: {
      noteRevision: fingerprintText(content),
      selectionMatch: "exact",
      selectedText: "Selected sentence.",
      selectionStart: { offset: start },
      selectionEnd: { offset: start + "Selected sentence.".length },
    },
  };

  await assert.doesNotReject(validateEditContextRevision(request));
});

test("rejects a stale edit target before the agent starts", async (t) => {
  const vaultPath = await mkdtemp(path.join(os.tmpdir(), "violet-edit-context-"));
  t.after(() => rm(vaultPath, { recursive: true, force: true }));
  await mkdir(path.join(vaultPath, "Notes"));
  const original = "# Target\n\nOld text.\n";
  await writeFile(path.join(vaultPath, "Notes", "Target.md"), "# Target\n\nChanged externally.\n");

  await assert.rejects(validateEditContextRevision({
    agentId: "author-editor",
    vaultPath,
    notePath: "Notes/Target.md",
    editContext: { noteRevision: fingerprintText(original) },
  }), /changed after the edit target was captured/);
});
