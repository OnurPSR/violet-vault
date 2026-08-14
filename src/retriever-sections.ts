export type RetrieverSectionKind = "direct" | "note" | "explanation";

export type RetrieverSection = {
  kind: RetrieverSectionKind;
  content: string;
};

const HEADING = /^#{1,6}\s+(From the note|Agent explanation)\s*:?\s*$/i;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;

export function splitRetrieverResponse(content: string): RetrieverSection[] {
  const sections: RetrieverSection[] = [];
  const lines = content.split("\n");
  let kind: RetrieverSectionKind = "direct";
  let buffer: string[] = [];
  let fence: { marker: string; length: number } | null = null;

  const flush = () => {
    const sectionContent = buffer.join("\n").trim();
    if (sectionContent) sections.push({ kind, content: sectionContent });
    buffer = [];
  };

  for (const line of lines) {
    const fenceMatch = line.match(FENCE);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      const length = fenceMatch[1].length;
      if (!fence) fence = { marker, length };
      else if (fence.marker === marker && length >= fence.length) fence = null;
      buffer.push(line);
      continue;
    }

    const heading = !fence ? line.match(HEADING) : null;
    if (!heading) {
      buffer.push(line);
      continue;
    }

    flush();
    kind = heading[1].toLowerCase() === "from the note" ? "note" : "explanation";
  }

  flush();
  return sections;
}
