import { MouseEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

type Props = {
  content: string;
  vaultPath: string | null;
  selectable?: boolean;
  selectedFigure?: string | null;
  assetRevision?: number;
  onTextSelect?: (text: string) => void;
  onFigureSelect?: (figure: { path: string; alt: string; dataUrl: string }) => void;
};

function normalizeObsidianEmbeds(content: string) {
  return content.replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, source: string, label?: string) => {
    const alt = label?.trim() || source.split("/").at(-1)?.replace(/\.[^.]+$/, "") || "Vault figure";
    return `![${alt.replaceAll("]", "\\]")}](${source.trim().replaceAll(" ", "%20")})`;
  });
}

function decodeAssetPath(source: string) {
  try { return decodeURIComponent(source); } catch { return source; }
}

function VaultFigure({ src, alt, vaultPath, selected, assetRevision, onSelect }: { src?: string; alt?: string; vaultPath: string | null; selected?: boolean; assetRevision?: number; onSelect?: (figure: { path: string; alt: string; dataUrl: string }) => void }) {
  const [asset, setAsset] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setAsset(null);
    setFailed(false);
    if (!src || !vaultPath) {
      setFailed(true);
      return;
    }

    const assetPath = decodeAssetPath(src);
    void window.violet.readVaultAsset(vaultPath, assetPath)
      .then(({ dataUrl }) => { if (!cancelled) setAsset(dataUrl); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [assetRevision, src, vaultPath]);

  if (failed) return <span className="figure-unavailable">Figure unavailable · {alt || src}</span>;
  if (!asset) return <span className="figure-loading">Loading figure…</span>;
  return (
    <span
      className={`vault-figure ${onSelect ? "selectable" : ""} ${selected ? "selected" : ""}`}
      role={onSelect ? "button" : "figure"}
      tabIndex={onSelect ? 0 : undefined}
      aria-label={onSelect ? `Select figure ${alt || src}` : alt || "Figure from the selected vault"}
      onClick={() => src && onSelect?.({ path: decodeAssetPath(src), alt: alt || src, dataUrl: asset })}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && src && onSelect) {
          event.preventDefault();
          onSelect({ path: decodeAssetPath(src), alt: alt || src, dataUrl: asset });
        }
      }}
    >
      <img src={asset} alt={alt || "Figure from the selected vault"} />
      {alt && <span className="vault-figure-caption">{alt}</span>}
      {selected && <span className="figure-selected-badge">Selected for edit</span>}
    </span>
  );
}

export default function RichMessage({ content, vaultPath, selectable = false, selectedFigure, assetRevision, onTextSelect, onFigureSelect }: Props) {
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

  return (
    <div className={`rich-message ${selectable ? "selectable-content" : ""}`} ref={root} onMouseUp={captureSelection}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          img: ({ src, alt }) => <VaultFigure src={src} alt={alt} vaultPath={vaultPath} selected={Boolean(src && selectedFigure === decodeAssetPath(src))} assetRevision={assetRevision} onSelect={onFigureSelect} />,
          a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
        }}
      >
        {normalizeObsidianEmbeds(content)}
      </ReactMarkdown>
    </div>
  );
}
