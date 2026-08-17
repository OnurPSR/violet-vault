function finiteToken(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : 0;
}

export function normalizeCodexUsage(tokenUsage) {
  const last = tokenUsage?.last ?? tokenUsage;
  if (!last || typeof last !== "object") return null;
  const usage = {
    provider: "codex",
    totalTokens: finiteToken(last.totalTokens),
    inputTokens: finiteToken(last.inputTokens),
    cachedInputTokens: finiteToken(last.cachedInputTokens),
    cacheWriteInputTokens: finiteToken(last.cacheWriteInputTokens),
    outputTokens: finiteToken(last.outputTokens),
    reasoningOutputTokens: finiteToken(last.reasoningOutputTokens),
    modelContextWindow: tokenUsage?.modelContextWindow == null ? null : finiteToken(tokenUsage.modelContextWindow),
  };
  if (!usage.totalTokens) usage.totalTokens = usage.inputTokens + usage.outputTokens;
  return usage.totalTokens || usage.inputTokens || usage.outputTokens ? usage : null;
}

export function parseClaudeRunOutput(stdout) {
  const fallback = { output: String(stdout).trim(), tokenUsage: null };
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return fallback;
  }
  if (!parsed || typeof parsed !== "object" || typeof parsed.result !== "string") return fallback;
  const raw = parsed.usage;
  if (!raw || typeof raw !== "object") return { output: parsed.result, tokenUsage: null };
  const uncachedInput = finiteToken(raw.input_tokens);
  const cachedInput = finiteToken(raw.cache_read_input_tokens);
  const cacheWriteInput = finiteToken(raw.cache_creation_input_tokens);
  const outputTokens = finiteToken(raw.output_tokens);
  const inputTokens = uncachedInput + cachedInput + cacheWriteInput;
  return {
    output: parsed.result,
    tokenUsage: {
      provider: "claude",
      totalTokens: inputTokens + outputTokens,
      inputTokens,
      cachedInputTokens: cachedInput,
      cacheWriteInputTokens: cacheWriteInput,
      outputTokens,
      reasoningOutputTokens: 0,
      modelContextWindow: null,
    },
  };
}

function parseCompactNumber(value) {
  const normalized = value.replace(/[\s,]/g, "").toLowerCase();
  const match = /^(\d+(?:\.\d+)?)([km])?$/.exec(normalized);
  if (!match) return null;
  const multiplier = match[2] === "k" ? 1_000 : match[2] === "m" ? 1_000_000 : 1;
  return Math.round(Number(match[1]) * multiplier);
}

export function extractTerminalTokenUsage(transcript, provider = "codex") {
  const clean = String(transcript)
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .slice(-16_000);
  const relevant = clean.split(/\r?\n/).filter((line) => /token|usage|context window/i.test(line)).slice(-20).join("\n");
  if (!relevant) return null;
  let contextWindow = null;
  let contextUsed = 0;
  for (const match of relevant.matchAll(/([\d,.]+\s*[kKmM]?)\s*used\s*\/\s*([\d,.]+\s*[kKmM]?)/g)) {
    contextUsed = parseCompactNumber(match[1]) ?? contextUsed;
    contextWindow = parseCompactNumber(match[2]) ?? contextWindow;
  }
  const read = (labels) => {
    const expression = new RegExp(`(?:${labels})\\s*(?:tokens?)?\\s*[:=]\\s*([\\d,.]+\\s*[kKmM]?)`, "gi");
    let value = null;
    for (const match of relevant.matchAll(expression)) value = parseCompactNumber(match[1]);
    return value ?? 0;
  };
  const inputTokens = read("(?<!cached\\s)(?<!cache\\s)(?:input|prompt)");
  const cachedInputTokens = read("cached(?: input)?|cache read");
  const outputTokens = read("output|completion");
  const reasoningOutputTokens = read("reasoning(?: output)?");
  let totalTokens = read("total|tokens used|token usage");
  if (!totalTokens) totalTokens = inputTokens + outputTokens;
  if (!totalTokens) totalTokens = contextUsed;
  if (!totalTokens) return null;
  return {
    provider,
    totalTokens,
    inputTokens,
    cachedInputTokens,
    cacheWriteInputTokens: 0,
    outputTokens,
    reasoningOutputTokens,
    modelContextWindow: contextWindow,
  };
}
