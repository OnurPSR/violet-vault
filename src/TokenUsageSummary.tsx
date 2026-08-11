import { Gauge } from "lucide-react";
import type { TokenUsage } from "./types";

type Props = {
  usage: TokenUsage | null | undefined;
  unavailable?: boolean;
  terminal?: boolean;
};

const formatter = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
const exactFormatter = new Intl.NumberFormat();

function compact(value: number) {
  return formatter.format(value);
}

export default function TokenUsageSummary({ usage, unavailable = false, terminal = false }: Props) {
  if (!usage) {
    if (!unavailable) return null;
    return (
      <div className={`token-usage ${terminal ? "terminal-token-usage" : ""}`} aria-label="Token usage unavailable">
        <Gauge size={12} aria-hidden="true" />
        <span>Token usage unavailable</span>
      </div>
    );
  }

  const title = [
    `${exactFormatter.format(usage.totalTokens)} total tokens`,
    `${exactFormatter.format(usage.inputTokens)} input`,
    usage.cachedInputTokens ? `${exactFormatter.format(usage.cachedInputTokens)} cached input` : null,
    `${exactFormatter.format(usage.outputTokens)} output`,
    usage.reasoningOutputTokens ? `${exactFormatter.format(usage.reasoningOutputTokens)} reasoning output` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className={`token-usage ${terminal ? "terminal-token-usage" : ""}`} aria-label={title} title={title}>
      <Gauge size={12} aria-hidden="true" />
      <span><strong>{compact(usage.totalTokens)}</strong> tokens</span>
      <span>{compact(usage.inputTokens)} input</span>
      {usage.cachedInputTokens > 0 && <span>{compact(usage.cachedInputTokens)} cached</span>}
      <span>{compact(usage.outputTokens)} output</span>
    </div>
  );
}
