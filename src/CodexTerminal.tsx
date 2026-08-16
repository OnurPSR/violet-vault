import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { Check, CircleStop, Command, Copy, Paperclip, X } from "lucide-react";
import { type DragEvent, useEffect, useRef, useState } from "react";
import { selectedOrAllTerminalText } from "./terminal-copy";
import type { RunRequest, TerminalExitEvent } from "./types";

type Props = {
  request: RunRequest;
  onStarted(sessionId: string): void;
  onData(data: string): void;
  onExit(event: TerminalExitEvent): void;
  onError(error: Error): void;
  onClose(): void;
};

export default function CodexTerminal({ request, onStarted, onData, onExit, onError, onClose }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const sessionId = useRef<string | null>(null);
  const exited = useRef(false);
  const [status, setStatus] = useState<"starting" | "live" | "exited">("starting");
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | null>(null);

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
    let cancelled = false;
    const clientSessionId = crypto.randomUUID();

    const terminal = new Terminal({
      allowProposedApi: false,
      cursorBlink: true,
      cursorStyle: "bar",
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
        cursor: "#b9a7ff",
        cursorAccent: "#0b0910",
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
    terminalRef.current = terminal;
    const fit = new FitAddon();
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
      try {
        fit.fit();
        if (sessionId.current) window.violet.resizeTerminal(sessionId.current, terminal.cols, terminal.rows);
      } catch {
        // The terminal can be between layout and disposal during a window resize.
      }
    };
    const frame = requestAnimationFrame(fitTerminal);
    const observer = new ResizeObserver(() => requestAnimationFrame(fitTerminal));
    observer.observe(host.current);

    const input = terminal.onData((data) => {
      if (sessionId.current && !exited.current) window.violet.sendTerminalInput(sessionId.current, data);
    });
    const removeData = window.violet.onTerminalData((event) => {
      if (event.clientSessionId !== clientSessionId) return;
      terminal.write(event.data);
      onData(event.data);
    });
    const removeExit = window.violet.onTerminalExit((event) => {
      if (event.clientSessionId !== clientSessionId) return;
      exited.current = true;
      setStatus("exited");
      onExit(event);
    });

    const launchTimer = window.setTimeout(() => {
      void window.violet.startCodexTerminal(request, { cols: terminal.cols, rows: terminal.rows }, clientSessionId)
        .then(({ sessionId: id }) => {
          if (cancelled) {
            void window.violet.closeTerminal(id);
            return;
          }
          sessionId.current = id;
          if (exited.current) return;
          setStatus("live");
          onStarted(id);
          terminal.focus();
        })
        .catch((cause) => {
          if (cancelled) return;
          exited.current = true;
          setStatus("exited");
          onError(cause instanceof Error ? cause : new Error("Unable to start the Codex terminal."));
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(launchTimer);
      cancelAnimationFrame(frame);
      observer.disconnect();
      input.dispose();
      removeData();
      removeExit();
      if (sessionId.current && !exited.current) void window.violet.closeTerminal(sessionId.current);
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
      terminalRef.current = null;
      terminal.dispose();
    };
  }, [request]);

  async function interrupt() {
    if (sessionId.current && status === "live") await window.violet.interruptTerminal(sessionId.current);
  }

  function writeImagePaths(paths: string[]) {
    if (!sessionId.current || status !== "live" || paths.length === 0) return;
    const escaped = paths.map((path) => `'${path.replaceAll("'", "'\\''")}'`).join(" ");
    window.violet.sendTerminalInput(sessionId.current, `${escaped} `);
    terminalRef.current?.focus();
  }

  async function attachImages() {
    const images = await window.violet.chooseImages();
    writeImagePaths(images.map((image) => image.path));
  }

  function dropImages(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const paths = Array.from(event.dataTransfer.files)
      .filter((file) => file.type.startsWith("image/"))
      .map((file) => window.violet.pathForFile(file))
      .filter(Boolean);
    writeImagePaths(paths);
  }

  async function close() {
    if (sessionId.current && status === "live") await window.violet.closeTerminal(sessionId.current);
    onClose();
  }

  return (
    <section className="codex-terminal-shell live-terminal-shell" aria-label="Codex CLI">
      <header className="terminal-chrome">
        <div className="terminal-lights" aria-hidden="true"><i /><i /><i /></div>
        <div className="terminal-identity">
          <span><Command size={14} /></span>
          <div><strong>Codex CLI</strong></div>
        </div>
        <div className="terminal-actions">
          {status !== "live" && <span className={`terminal-live-state ${status}`}><i />{status === "starting" ? "Starting" : "Session ended"}</span>}
          <button onClick={() => void copyOutput()} title="Copy selection, or all output when nothing is selected">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy"}</button>
          <button onClick={() => void attachImages()} disabled={status !== "live"} title="Attach an image to the Codex composer"><Paperclip size={14} />Attach</button>
          <button onClick={() => void interrupt()} disabled={status !== "live"} title="Send Ctrl+C to Codex"><CircleStop size={14} />Interrupt</button>
          <button className="terminal-close" onClick={() => void close()} title="Close terminal"><X size={15} /></button>
        </div>
      </header>
      <div
        className={`terminal-stage ${dragging ? "dragging" : ""}`}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={dropImages}
      >
        <div className="terminal-host" ref={host} />
        {dragging && <div className="terminal-drop-overlay"><Paperclip size={22} /><strong>Drop images into the Codex prompt</strong></div>}
      </div>
    </section>
  );
}
