import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { Check, Clock3, Command, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { selectedOrAllTerminalText } from "./terminal-copy";
import TokenUsageSummary from "./TokenUsageSummary";
import type { TokenUsage } from "./types";

type Props = {
  transcript: string;
  tokenUsage?: TokenUsage | null;
};

export default function CodexTranscript({ transcript, tokenUsage }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const copyTimer = useRef<number | null>(null);
  const [copied, setCopied] = useState(false);

  async function copyOutput() {
    const terminal = terminalRef.current;
    if (!terminal) return;
    const text = selectedOrAllTerminalText(terminal);
    if (!text) return;
    const result = await window.violet.copyText(text);
    if (!result.copied) throw new Error("The terminal output could not be copied.");
    setCopied(true);
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 1600);
  }

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
      scrollback: 10_000,
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
    terminalRef.current = terminal;
    terminal.loadAddon(fit);
    terminal.open(host.current);
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type === "keydown" && (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "c") {
        void copyOutput();
        return false;
      }
      return true;
    });

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
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
      terminalRef.current = null;
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
        <div className="terminal-actions transcript-actions">
          <span className="transcript-status"><Clock3 size={13} />History</span>
          <button onClick={() => void copyOutput()} title="Copy selection, or all output when nothing is selected">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy"}</button>
        </div>
      </header>
      <div className="terminal-stage"><div className="terminal-host" ref={host} /></div>
      <footer className="terminal-footer transcript-footer">
        <span>Read-only terminal transcript</span>
        <TokenUsageSummary usage={tokenUsage} unavailable terminal />
      </footer>
    </section>
  );
}
