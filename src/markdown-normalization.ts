function delimiterIsEscaped(source: string, index: number) {
  let precedingSlashes = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) precedingSlashes += 1;
  return precedingSlashes % 2 === 1;
}

function findClosingDelimiter(source: string, delimiter: string, start: number) {
  let cursor = source.indexOf(delimiter, start);
  while (cursor >= 0 && delimiterIsEscaped(source, cursor)) cursor = source.indexOf(delimiter, cursor + delimiter.length);
  return cursor;
}

function normalizeInlineLatex(line: string) {
  let rendered = "";
  let cursor = 0;

  while (cursor < line.length) {
    if (line[cursor] === "`") {
      let markerEnd = cursor + 1;
      while (line[markerEnd] === "`") markerEnd += 1;
      const marker = line.slice(cursor, markerEnd);
      const closing = line.indexOf(marker, markerEnd);
      if (closing < 0) return rendered + line.slice(cursor);
      rendered += line.slice(cursor, closing + marker.length);
      cursor = closing + marker.length;
      continue;
    }

    const opener = line.slice(cursor, cursor + 2);
    if ((opener === "\\(" || opener === "\\[") && !delimiterIsEscaped(line, cursor)) {
      const closer = opener === "\\(" ? "\\)" : "\\]";
      const closing = findClosingDelimiter(line, closer, cursor + 2);
      if (closing >= 0) {
        rendered += `$${line.slice(cursor + 2, closing)}$`;
        cursor = closing + 2;
        continue;
      }
    }

    rendered += line[cursor];
    cursor += 1;
  }

  return rendered;
}

function normalizeLatexOutsideFence(content: string) {
  const displayDelimiters = content
    .replace(/^([ \t]*)\\\[\s*$/gm, "$1$$$$")
    .replace(/^([ \t]*)\\\]\s*$/gm, "$1$$$$");
  return displayDelimiters.split("\n").map(normalizeInlineLatex).join("\n");
}

export function normalizeLatexDelimiters(content: string) {
  const lines = content.match(/.*(?:\n|$)/g)?.filter(Boolean) ?? [];
  const output: string[] = [];
  let textBuffer = "";
  let fence: { marker: string; length: number } | null = null;

  const flushText = () => {
    if (textBuffer) output.push(normalizeLatexOutsideFence(textBuffer));
    textBuffer = "";
  };

  for (const line of lines) {
    const body = line.endsWith("\n") ? line.slice(0, -1) : line;
    const fenceMatch = body.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence) {
      output.push(line);
      if (fenceMatch && fenceMatch[1][0] === fence.marker && fenceMatch[1].length >= fence.length) fence = null;
      continue;
    }
    if (fenceMatch) {
      flushText();
      fence = { marker: fenceMatch[1][0], length: fenceMatch[1].length };
      output.push(line);
      continue;
    }
    textBuffer += line;
  }

  flushText();
  return output.join("");
}

export function normalizeObsidianEmbeds(content: string) {
  return content.replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, source: string, label?: string) => {
    const embedOption = label?.trim();
    const caption = embedOption && !/^\d+(?:x\d+)?$/i.test(embedOption) ? embedOption : undefined;
    const alt = caption || source.split("/").at(-1)?.replace(/\.[^.]+$/, "") || "Vault figure";
    const vaultRootPath = `/${source.trim().replace(/^\/+/, "").replaceAll(" ", "%20")}`;
    return `![${alt.replaceAll("]", "\\]")}](${vaultRootPath})`;
  });
}

export function normalizeMarkdownForRendering(content: string) {
  return normalizeObsidianEmbeds(normalizeLatexDelimiters(content));
}
