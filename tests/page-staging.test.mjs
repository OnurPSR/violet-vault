import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { cleanupUnreferencedUploadedPages, saveUploadedPages } from "../electron/page-staging.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "violet-page-staging-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const vaultPath = path.join(root, "vault");
  await mkdir(vaultPath);
  return { root, vaultPath };
}

test("copies uploaded pages to the note attachment directory", async (t) => {
  const { root, vaultPath } = await fixture(t);
  const first = path.join(root, "first.png");
  const second = path.join(root, "second.jpg");
  await writeFile(first, "first");
  await writeFile(second, "second");

  const pages = await saveUploadedPages({
    vaultPath,
    notePath: "Courses/Calculus.md",
    images: [{ path: first }, { path: second }],
  });

  assert.deepEqual(pages.map((page) => page.vaultPath), [
    "attachments/Calculus/notes/page-1.png",
    "attachments/Calculus/notes/page-2.jpg",
  ]);
  assert.equal(await readFile(pages[0].absolutePath, "utf8"), "first");
  assert.equal(await readFile(pages[1].absolutePath, "utf8"), "second");
});

test("continues page numbering without overwriting existing uploads", async (t) => {
  const { root, vaultPath } = await fixture(t);
  const directory = path.join(vaultPath, "attachments", "Calculus", "notes");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "page-2.png"), "existing");
  const source = path.join(root, "next.png");
  await writeFile(source, "next");

  const [page] = await saveUploadedPages({ vaultPath, notePath: "Calculus.md", images: [{ path: source }] });

  assert.equal(page.vaultPath, "attachments/Calculus/notes/page-3.png");
  assert.equal(await readFile(path.join(directory, "page-2.png"), "utf8"), "existing");
});

test("removes uploaded pages that were not embedded after a failed or incomplete run", async (t) => {
  const { root, vaultPath } = await fixture(t);
  const noteDirectory = path.join(vaultPath, "Courses");
  await mkdir(noteDirectory);
  await writeFile(path.join(noteDirectory, "Calculus.md"), "# Calculus\n");
  const source = path.join(root, "unused.png");
  await writeFile(source, "unused");
  const pages = await saveUploadedPages({ vaultPath, notePath: "Courses/Calculus.md", images: [{ path: source }] });

  const result = await cleanupUnreferencedUploadedPages({ vaultPath, notePath: "Courses/Calculus.md", pages });

  assert.deepEqual(result.removed, ["attachments/Calculus/notes/page-1.png"]);
  await assert.rejects(access(pages[0].absolutePath), /ENOENT/);
});

test("retains uploaded pages that the target note references", async (t) => {
  const { root, vaultPath } = await fixture(t);
  const noteDirectory = path.join(vaultPath, "Courses");
  await mkdir(noteDirectory);
  const source = path.join(root, "used.png");
  await writeFile(source, "used");
  const pages = await saveUploadedPages({ vaultPath, notePath: "Courses/Calculus.md", images: [{ path: source }] });
  await writeFile(path.join(noteDirectory, "Calculus.md"), `# Calculus\n\n![[${pages[0].vaultPath}]]\n`);

  const result = await cleanupUnreferencedUploadedPages({ vaultPath, notePath: "Courses/Calculus.md", pages });

  assert.deepEqual(result.retained, ["attachments/Calculus/notes/page-1.png"]);
  assert.equal(await readFile(pages[0].absolutePath, "utf8"), "used");
});
