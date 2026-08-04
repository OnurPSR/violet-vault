export function sanitizeVaultSvg(source) {
  if (typeof source !== "string" || !/^\s*<svg[\s>]/i.test(source)) throw new Error("The vault SVG is invalid.");
  return source
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject\s*>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*')/gi, "")
    .replace(/\s+(?:href|xlink:href)\s*=\s*(["'])\s*(?:https?:|file:|javascript:)[\s\S]*?\1/gi, "");
}
