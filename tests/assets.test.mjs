import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeVaultSvg } from "../electron/assets.mjs";

test("vault SVG figures preserve vector content and embedded data fonts", () => {
  const source = '<svg xmlns="http://www.w3.org/2000/svg"><style>@font-face{src:url(data:font/woff2;base64,abc)}</style><path d="M0 0L10 10"/></svg>';
  assert.equal(sanitizeVaultSvg(source), source);
});

test("vault SVG figures accept standard XML declarations and a byte-order mark", () => {
  const source = '\uFEFF<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L10 10"/></svg>';
  assert.equal(sanitizeVaultSvg(source), source);
});

test("vault SVG figures accept comments and remove document type declarations", () => {
  const source = '<?xml version="1.0"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n<!-- generated diagram -->\n<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L10 10"/></svg>';
  const result = sanitizeVaultSvg(source);
  assert.doesNotMatch(result, /doctype/i);
  assert.match(result, /<svg/);
});

test("vault SVG figures remove scripts, event handlers, foreign objects, and external links", () => {
  const result = sanitizeVaultSvg('<svg onload="bad()"><script>bad()</script><foreignObject>html</foreignObject><image href="https://example.com/a.png"/><path onclick=\'bad()\' d="M0 0"/></svg>');
  assert.doesNotMatch(result, /script|foreignObject|onload|onclick|https:/i);
  assert.match(result, /<path d="M0 0"\/>/);
});

test("non-SVG content is rejected", () => {
  assert.throws(() => sanitizeVaultSvg("not an svg"), /invalid/);
});
