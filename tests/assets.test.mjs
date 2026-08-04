import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeVaultSvg } from "../electron/assets.mjs";

test("vault SVG figures preserve vector content and embedded data fonts", () => {
  const source = '<svg xmlns="http://www.w3.org/2000/svg"><style>@font-face{src:url(data:font/woff2;base64,abc)}</style><path d="M0 0L10 10"/></svg>';
  assert.equal(sanitizeVaultSvg(source), source);
});

test("vault SVG figures remove scripts, event handlers, foreign objects, and external links", () => {
  const result = sanitizeVaultSvg('<svg onload="bad()"><script>bad()</script><foreignObject>html</foreignObject><image href="https://example.com/a.png"/><path onclick=\'bad()\' d="M0 0"/></svg>');
  assert.doesNotMatch(result, /script|foreignObject|onload|onclick|https:/i);
  assert.match(result, /<path d="M0 0"\/>/);
});

test("non-SVG content is rejected", () => {
  assert.throws(() => sanitizeVaultSvg("not an svg"), /invalid/);
});
