import assert from "node:assert/strict";
import test from "node:test";
import { extractComparisonPages } from "../src/page-comparison.ts";

const reconstructedNote = `---
tags: [lecture]
---

# Attention

Intro paragraph before the first page.

## Page 1

Scaled dot-product attention.

![Attention flow](attachments/Attention/attention-flow.svg)

[View handwritten source page 1](attachments/Attention/notes/page-1.png)

## Page 2

$$QK^T / \\sqrt{d_k}$$

[View handwritten source page 2](attachments/Attention/notes/page-2.jpg)
`;

test("extracts one comparison page per Page section with its linked source image", () => {
  const pages = extractComparisonPages(reconstructedNote, "Attention.md");
  assert.equal(pages.length, 2);
  assert.deepEqual(pages.map((page) => page.number), [1, 2]);
  assert.equal(pages[0].imagePath, "attachments/Attention/notes/page-1.png");
  assert.equal(pages[1].imagePath, "attachments/Attention/notes/page-2.jpg");
  assert.equal(pages[1].imageName, "page-2.jpg");
});

test("keeps section content but strips the standalone source link line", () => {
  const pages = extractComparisonPages(reconstructedNote, "Attention.md");
  assert.match(pages[0].content, /Scaled dot-product attention\./);
  assert.match(pages[0].content, /attention-flow\.svg/);
  assert.ok(!pages[0].content.includes("page-1.png"));
});

test("supports angle-bracketed targets with unencoded spaces", () => {
  const pages = extractComparisonPages(
    "## Page 1\n\nBody.\n\n[View handwritten source page 1](<attachments/VLM Models/notes/page-1.jpeg>)\n",
    "VLM Models.md",
  );
  assert.equal(pages[0].imagePath, "attachments/VLM Models/notes/page-1.jpeg");
});

test("accepts vault-root-relative targets from a nested note", () => {
  const pages = extractComparisonPages(
    "## Page 1\n\nBody.\n\n[View handwritten source page 1](<attachments/VLM Models/notes/page-1.jpeg>)\n",
    "AI/Theoretical AI/VLM Models.md",
  );
  assert.equal(pages[0].imagePath, "attachments/VLM Models/notes/page-1.jpeg");
});

test("resolves relative targets against the note's own folder", () => {
  const pages = extractComparisonPages(
    "## Page 10\n\nBody.\n\n[View handwritten source page 10](../../attachments/Transformers/notes/page-10.jpg)\n",
    "AI/Theoretical AI/Transformers.md",
  );
  assert.equal(pages[0].imagePath, "attachments/Transformers/notes/page-10.jpg");
});

test("accepts a bare page-N filename, which the asset loader resolves by unique name", () => {
  const pages = extractComparisonPages(
    "## Page 1\n\nBody.\n\n[View handwritten source page 1](page-1.jpg)\n",
    "AI/Theoretical AI/Transformers.md",
  );
  assert.equal(pages[0].imagePath, "page-1.jpg");
  assert.ok(!pages[0].content.includes("page-1.jpg"));
});

test("only images under attachments/{note_name}/notes/ count as source pages", () => {
  const figureOnly = "## Page 1\n\n![figure](attachments/Attention/fig.svg)\n\n![other](attachments/Other/notes/page-1.png)\n";
  assert.equal(extractComparisonPages(figureOnly, "Attention.md"), null);
  const bareFigure = "## Page 1\n\n![figure](diagram.svg)\n";
  assert.equal(extractComparisonPages(bareFigure, "Attention.md"), null);
  const withSource = "## Page 1\n\n![figure](attachments/Attention/fig.svg)\n\n[View handwritten source page 1](attachments/Attention/notes/page-1.png)\n";
  const pages = extractComparisonPages(withSource, "Attention.md");
  assert.equal(pages[0].imagePath, "attachments/Attention/notes/page-1.png");
});

test("a trailing embedded figure never shadows the source link", () => {
  const pages = extractComparisonPages(
    "## Page 1\n\n[View handwritten source page 1](attachments/Attention/notes/page-1.png)\n\n![late figure](attachments/Attention/excalidraw_svg/sketch.svg)\n",
    "Attention.md",
  );
  assert.equal(pages[0].imagePath, "attachments/Attention/notes/page-1.png");
});

test("supports encoded and wiki-link source references and note names with spaces", () => {
  const encoded = extractComparisonPages("## Page 1\n\nBody.\n\n[source](attachments/My%20Note/notes/page-1.png)\n", "My Note.md");
  assert.equal(encoded[0].imagePath, "attachments/My Note/notes/page-1.png");
  const wiki = extractComparisonPages("## Page 1\n\nBody.\n\n![[attachments/My Note/notes/page-1.png]]\n", "My Note.md");
  assert.equal(wiki[0].imagePath, "attachments/My Note/notes/page-1.png");
});

test("returns null when the note is empty, unnamed, or has no page sections", () => {
  assert.equal(extractComparisonPages("", "Attention.md"), null);
  assert.equal(extractComparisonPages(undefined, "Attention.md"), null);
  assert.equal(extractComparisonPages(reconstructedNote, undefined), null);
  assert.equal(extractComparisonPages("# Title\n\nJust prose, no pages.", "Attention.md"), null);
  assert.equal(extractComparisonPages("---\ntags: [x]\n---\n", "Attention.md"), null);
});

test("returns null when any page section lacks a source-page link", () => {
  const missing = "## Page 1\n\nText.\n\n[View handwritten source page 1](attachments/Attention/notes/page-1.png)\n\n## Page 2\n\nText without a source link.\n";
  assert.equal(extractComparisonPages(missing, "Attention.md"), null);
});

test("ignores page-like headings inside fenced code blocks", () => {
  const fenced = "## Page 1\n\n```md\n## Page 99\n```\n\n[source](attachments/Attention/notes/page-1.png)\n";
  const pages = extractComparisonPages(fenced, "Attention.md");
  assert.equal(pages.length, 1);
  assert.equal(pages[0].number, 1);
});

test("does not treat external image URLs as vault source images", () => {
  assert.equal(extractComparisonPages("## Page 1\n\n[source](https://example.com/attachments/Attention/notes/page-1.png)\n", "Attention.md"), null);
});
