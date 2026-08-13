export function sanitizeVaultSvg(source) {
  const withoutPreamble = typeof source === "string"
    ? source
      .replace(/^\uFEFF/, "")
      .replace(/^\s*<\?xml[\s\S]*?\?>/i, "")
      .replace(/^\s*<!doctype[\s\S]*?>/i, "")
      .replace(/^(?:\s*<!--[\s\S]*?-->)+/, "")
    : "";
  if (!/^\s*<svg[\s>]/i.test(withoutPreamble)) {
    throw new Error("The vault SVG is invalid.");
  }
  return source
    .replace(/<!doctype[\s\S]*?>/gi, "")
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject\s*>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*')/gi, "")
    .replace(/\s+(?:href|xlink:href)\s*=\s*(["'])\s*(?:https?:|file:|javascript:)[\s\S]*?\1/gi, "");
}
