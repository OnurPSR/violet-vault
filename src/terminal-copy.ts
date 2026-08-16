import type { Terminal } from "@xterm/xterm";

export function terminalText(terminal: Terminal) {
  const buffer = terminal.buffer.active;
  let text = "";

  for (let index = 0; index < buffer.length; index += 1) {
    const line = buffer.getLine(index);
    if (!line) continue;
    text += line.translateToString(true);
    if (index === buffer.length - 1 || !buffer.getLine(index + 1)?.isWrapped) text += "\n";
  }

  return text.trimEnd();
}

export function selectedOrAllTerminalText(terminal: Terminal) {
  return terminal.hasSelection() ? terminal.getSelection() : terminalText(terminal);
}
