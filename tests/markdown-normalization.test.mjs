import assert from "node:assert/strict";
import test from "node:test";
import { unified } from "unified";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { normalizeLatexDelimiters, normalizeMarkdownForRendering } from "../src/markdown-normalization.ts";

test("normalizes common LaTeX delimiters into remark-math syntax", () => {
  const normalized = normalizeLatexDelimiters("Token \\(E_i\\).\n   \\[\n   QK^T / \\sqrt{d_k}\n   \\]");
  assert.equal(normalized, "Token $E_i$.\n   $$\n   QK^T / \\sqrt{d_k}\n   $$");

  const tree = unified().use(remarkParse).use(remarkMath).parse(normalized);
  const paragraph = tree.children[0];
  const display = tree.children[1];
  assert.equal(paragraph.type, "paragraph");
  assert.ok(paragraph.children.some((child) => child.type === "inlineMath"));
  assert.equal(display.type, "math");
});

test("does not rewrite LaTeX examples inside code", () => {
  const source = "`\\(inline example\\)`\n\n```text\n\\[display example\\]\n```\n\nActual \\(x\\).";
  const normalized = normalizeLatexDelimiters(source);
  assert.match(normalized, /`\\\(inline example\\\)`/);
  assert.match(normalized, /```text\n\\\[display example\\\]\n```/);
  assert.match(normalized, /Actual \$x\$\./);
});

test("normalizes Obsidian figure embeds after LaTeX", () => {
  assert.equal(
    normalizeMarkdownForRendering("\\(x\\)\n\n![[Figures/attention map.svg|Attention map]]"),
    "$x$\n\n![Attention map](/Figures/attention%20map.svg)",
  );
});
