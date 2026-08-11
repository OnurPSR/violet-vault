import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { Clock3, Command } from "lucide-react";
import { useEffect, useRef } from "react";
import TokenUsageSummary from "./TokenUsageSummary";
import type { TokenUsage } from "./types";

type Props = {
  transcript: string;
  tokenUsage?: TokenUsage | null;
};

export default function CodexTranscript({ transcript, tokenUsage }: Props) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current) return;
    const terminal = new Terminal({
      cursorBlink: false,
      disableStdin: true,
      fontFamily: '"JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace',
      fontSize: 13.5,
      fontWeight: "400",
      fontWeightBold: "700",
      letterSpacing: 0.15,
      lineHeight: 1.18,
      scrollback: 20_000,
      theme: {
        background: "#0b0910",
        foreground: "#eeeaf3",
        cursor: "#0b0910",
        selectionBackground: "#7158c866",
        black: "#15121b",
        red: "#ff7f91",
        green: "#82d6a2",
        yellow: "#e8c889",
        blue: "#8ca9ff",
        magenta: "#c69cff",
        cyan: "#7fd7db",
        white: "#eeeaf3",
        brightBlack: "#777080",
        brightRed: "#ff9eaa",
        brightGreen: "#a1e8b9",
        brightYellow: "#f3dba5",
        brightBlue: "#a9bcff",
        brightMagenta: "#d8b8ff",
        brightCyan: "#a4e7e9",
        brightWhite: "#ffffff",
      },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host.current);

    const fitTerminal = () => {
      try { fit.fit(); } catch { /* Layout can race disposal. */ }
    };
    const frame = requestAnimationFrame(fitTerminal);
    const observer = new ResizeObserver(() => requestAnimationFrame(fitTerminal));
    observer.observe(host.current);
    terminal.write(transcript, () => terminal.scrollToTop());

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      terminal.dispose();
    };
  }, [transcript]);

  return (
    <section className="codex-terminal-shell transcript-shell" aria-label="Saved Codex terminal transcript">
      <header className="terminal-chrome">
        <div className="terminal-lights archived" aria-hidden="true"><i /><i /><i /></div>
        <div className="terminal-identity">
          <span><Command size={14} /></span>
          <div><strong>Codex CLI</strong><small>Saved terminal session</small></div>
        </div>
        <span className="transcript-status"><Clock3 size={13} />History</span>
      </header>
      <div className="terminal-stage"><div className="terminal-host" ref={host} /></div>
      <footer className="terminal-footer transcript-footer">
        <span>Read-only terminal transcript</span>
        <TokenUsageSummary usage={tokenUsage} unavailable terminal />
      </footer>
    </section>
  );
}
