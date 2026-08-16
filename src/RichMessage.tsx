import { BookOpenText, Sparkles } from "lucide-react";
import { memo, MouseEvent, ReactNode, useEffect, useId, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { normalizeMarkdownForRendering, parseEmbedDimensions } from "./markdown-normalization";
import { splitRetrieverResponse } from "./retriever-sections";

type Props = {
  content: string;
  vaultPath: string | null;
  notePath?: string | null;
  selectable?: boolean;
  selectedFigure?: string | null;
  assetRevision?: number;
  provenanceMode?: boolean;
  onTextSelect?: (text: string) => void;
  onFigureSelect?: (figure: { path: string; alt: string; dataUrl: string }) => void;
};

function decodeAssetPath(source: string) {
  try { return decodeURIComponent(source); } catch { return source; }
}

function resolveAssetPath(source: string, notePath?: string | null) {
  const decoded = decodeAssetPath(source).split(/[?#]/, 1)[0];
  const rootRelative = decoded.startsWith("/");
  const segments = rootRelative || !notePath
    ? decoded.replace(/^\/+/, "").split("/")
    : [...notePath.split("/").slice(0, -1), ...decoded.split("/")];
  const normalized: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") normalized.pop();
    else normalized.push(segment);
  }
  return normalized.join("/");
}

function MermaidDiagram({ source }: { source: string }) {
  const renderId = `mermaid-${useId().replace(/[^a-z0-9_-]/gi, "")}`;
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const diagramId = `${renderId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setSvg(null);
    setFailed(false);
    void import("mermaid")
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "dark" });
        const parsed = await mermaid.parse(source, { suppressErrors: true });
        if (!parsed) throw new Error("Invalid Mermaid diagram");
        const rendered = await mermaid.render(diagramId, source);
        if (!cancelled) setSvg(rendered.svg);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [renderId, source]);

  if (failed) return <pre className="mermaid-unavailable"><code>{source}</code></pre>;
  if (!svg) return <span className="figure-loading">Rendering diagram…</span>;
  return <div className="mermaid-diagram" role="img" aria-label="Mermaid diagram" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function VaultFigure({ src, alt, vaultPath, notePath, selected, assetRevision, onSelect }: { src?: string; alt?: string; vaultPath: string | null; notePath?: string | null; selected?: boolean; assetRevision?: number; onSelect?: (figure: { path: string; alt: string; dataUrl: string }) => void }) {
  const [asset, setAsset] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const assetPath = src ? resolveAssetPath(src, notePath) : "";
  const isSvg = assetPath.split(/[?#]/, 1)[0].toLowerCase().endsWith(".svg");
  const dimensions = src ? parseEmbedDimensions(src) : null;

  useEffect(() => {
    let cancelled = false;
    setAsset(null);
    setFailed(false);
    if (!src || !vaultPath) {
      setFailed(true);
      return;
    }

    void (async () => {
      for (const delay of [0, 250, 750, 1_500]) {
        if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay));
        if (cancelled) return;
        try {
          const { dataUrl } = await window.violet.readVaultAsset(vaultPath, assetPath);
          if (!cancelled) setAsset(dataUrl);
          return;
        } catch {
          // Markdown is often written before its generated diagram asset; retry briefly.
        }
      }
      if (!cancelled) setFailed(true);
    })();
    return () => { cancelled = true; };
  }, [assetPath, assetRevision, src, vaultPath]);

  if (failed) return <span className="figure-unavailable">Figure unavailable · {alt || src}</span>;
  if (!asset) return <span className="figure-loading">Loading figure…</span>;
  return (
    <span
      className={`vault-figure ${isSvg ? "svg-figure" : ""} ${onSelect ? "selectable" : ""} ${selected ? "selected" : ""}`}
      role={onSelect ? "button" : "figure"}
      tabIndex={onSelect ? 0 : undefined}
      aria-label={onSelect ? `Select figure ${alt || src}` : alt || "Figure from the selected vault"}
      onClick={() => src && onSelect?.({ path: assetPath, alt: alt || src, dataUrl: asset })}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && src && onSelect) {
          event.preventDefault();
          onSelect({ path: assetPath, alt: alt || src, dataUrl: asset });
        }
      }}
    >
      <img
        src={asset}
        alt={alt || "Figure from the selected vault"}
        style={dimensions ? { width: dimensions.width, height: dimensions.height ?? undefined, maxWidth: "100%" } : undefined}
      />
      {alt && <span className="vault-figure-caption">{alt}</span>}
      {selected && <span className="figure-selected-badge">Selected for edit</span>}
    </span>
  );
}

function RichMessage({ content, vaultPath, notePath, selectable = false, selectedFigure, assetRevision, provenanceMode = false, onTextSelect, onFigureSelect }: Props) {
  const root = useRef<HTMLDivElement>(null);

  function captureSelection(event: MouseEvent<HTMLDivElement>) {
    if (!selectable || !onTextSelect) return;
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (!selection || !text || !root.current) return;
    const range = selection.rangeCount ? selection.getRangeAt(0) : null;
    if (!range || !root.current.contains(range.commonAncestorContainer)) return;
    event.stopPropagation();
    onTextSelect(text.slice(0, 8_000));
  }

  function renderMarkdown(markdown: string): ReactNode {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          img: ({ src, alt }) => {
            const assetPath = src ? resolveAssetPath(src, notePath) : "";
            return <VaultFigure src={src} alt={alt} vaultPath={vaultPath} notePath={notePath} selected={Boolean(src && selectedFigure === assetPath)} assetRevision={assetRevision} onSelect={onFigureSelect} />;
          },
          code: ({ className, children, ...properties }) => className?.split(/\s+/).includes("language-mermaid")
            ? <MermaidDiagram source={String(children).replace(/\n$/, "")} />
            : <code className={className} {...properties}>{children}</code>,
          a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
        }}
      >
        {normalizeMarkdownForRendering(markdown)}
      </ReactMarkdown>
    );
  }

  const sections = provenanceMode ? splitRetrieverResponse(content) : [];
  const hasProvenanceSections = sections.some((section) => section.kind !== "direct");

  return (
    <div className={`rich-message ${selectable ? "selectable-content" : ""} ${hasProvenanceSections ? "provenance-response" : ""}`} ref={root} onMouseUp={captureSelection}>
      {hasProvenanceSections
        ? sections.map((section, index) => section.kind === "direct"
          ? <div className="retriever-direct" key={`${section.kind}-${index}`}>{renderMarkdown(section.content)}</div>
          : (
            <section className={`retriever-section ${section.kind}`} key={`${section.kind}-${index}`} aria-label={section.kind === "note" ? "Information from the note" : "Agent explanation"}>
              <header>
                {section.kind === "note" ? <BookOpenText size={15} /> : <Sparkles size={15} />}
                <span>{section.kind === "note" ? "From the note" : "Agent explanation"}</span>
              </header>
              <div className="retriever-section-body">{renderMarkdown(section.content)}</div>
            </section>
          ))
        : renderMarkdown(content)}
    </div>
  );
}

export default memo(RichMessage);
