import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { sliceRegion } from "../agents/author-editor/.agents/skills/note-validation/scripts/render_check.mjs";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(projectRoot, "agents", "author-editor", ".agents", "skills", "note-validation", "scripts", "render_check.mjs");
const headless = !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY;

const clippedSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
  <rect x="10" y="10" width="120" height="60" fill="#f3f0ff" stroke="#7048e8"/>
  <text x="180" y="95" font-size="14">label past the viewBox</text>
</svg>
`;

test("slices a note region at its heading level", () => {
  const note = "# Note\n\n## Page 9\n\nkept\n\n### Detail\n\nalso kept\n\n## Page 10\n\ndropped\n";
  assert.equal(sliceRegion(note, "Page 9"), "## Page 9\n\nkept\n\n### Detail\n\nalso kept\n");
  assert.equal(sliceRegion(note, null), note);
  assert.throws(() => sliceRegion(note, "Page 42"), /Region heading not found/);
});

test("reports clipped and unresolved figures from the rendered region", { skip: headless && "no display for offscreen rendering" }, async (t) => {
  const vault = await mkdtemp(path.join(os.tmpdir(), "violet-render-"));
  const out = path.join(vault, "report");
  t.after(() => rm(vault, { recursive: true, force: true }));
  await mkdir(path.join(vault, "attachments"));
  await writeFile(path.join(vault, "attachments", "figure.svg"), clippedSvg);
  await writeFile(path.join(vault, "note.md"), "## Page 1\n\n$E_i$\n\n![[attachments/figure.svg|1000]]\n\n![[attachments/absent.svg]]\n");

  const failure = await execFileAsync(process.execPath, [script, "--vault", vault, "--note", "note.md", "--region", "Page 1", "--out", out])
    .then(() => null, (error) => error);
  assert.ok(failure, "expected a failing exit code");
  assert.equal(failure.code, 1);

  const report = JSON.parse(await readFile(path.join(out, "report.json"), "utf8"));
  assert.deepEqual(report.issues.map((issue) => issue.code).sort(), ["figure-clipped", "figure-unresolved"]);
  assert.equal(report.figures[0].intrinsic.width, 200);
  assert.equal(report.figures[0].rendered.width, 700, "the |1000 embed is capped by the note column");
  await readFile(path.join(out, "compare.jpg"));
});
