import { Camera, ChevronLeft, ChevronRight, Columns2, ImageOff, X } from "lucide-react";
import { KeyboardEvent, memo, useEffect, useState } from "react";
import RichMessage from "./RichMessage";
import type { ComparisonPage } from "./page-comparison";

type Props = {
  noteName: string;
  notePath: string;
  vaultPath: string | null;
  pages: ComparisonPage[];
  assetRevision?: number;
  selectedFigure?: string | null;
  onTextSelect?: (text: string) => void;
  onFigureSelect?: (figure: { path: string; alt: string; dataUrl: string }) => void;
  onClose: () => void;
};

function SourcePageImage({ vaultPath, imagePath, imageName, assetRevision }: { vaultPath: string | null; imagePath: string; imageName: string; assetRevision?: number }) {
  const [asset, setAsset] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setAsset(null);
    setFailed(false);
    if (!vaultPath) {
      setFailed(true);
      return;
    }
    window.violet.readVaultAsset(vaultPath, imagePath)
      .then(({ dataUrl }) => { if (!cancelled) setAsset(dataUrl); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [assetRevision, imagePath, vaultPath]);

  if (failed) {
    return <div className="compare-source-missing"><ImageOff size={22} /><strong>Source page unavailable</strong><p>{imagePath}</p></div>;
  }
  if (!asset) {
    return <div className="compare-pane-loading"><i /><i /><i /><span>Loading {imageName}…</span></div>;
  }
  return <img src={asset} alt={`Handwritten source ${imageName}`} draggable={false} />;
}

function PageComparison({ noteName, notePath, vaultPath, pages, assetRevision, selectedFigure, onTextSelect, onFigureSelect, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const boundedIndex = Math.min(index, pages.length - 1);
  const page = pages[boundedIndex];

  function goTo(nextIndex: number) {
    const target = Math.min(pages.length - 1, Math.max(0, nextIndex));
    if (target === boundedIndex) return;
    setDirection(target > boundedIndex ? "forward" : "backward");
    setIndex(target);
  }

  function pagerKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") { event.preventDefault(); goTo(boundedIndex - 1); }
    if (event.key === "ArrowRight") { event.preventDefault(); goTo(boundedIndex + 1); }
  }

  return (
    <article className="page-comparison" aria-label={`Source versus rendered comparison for ${noteName}`}>
      <header className="compare-header">
        <div>
          <span className="compare-header-icon"><Columns2 size={15} /></span>
          <span><strong>{noteName}</strong><small>{notePath} · Source vs rendered</small></span>
        </div>
        <div className="compare-pager" role="group" aria-label="Choose the page to compare" onKeyDown={pagerKeys}>
          <button className="compare-step" disabled={boundedIndex === 0} onClick={() => goTo(boundedIndex - 1)} title="Previous page" aria-label="Previous page"><ChevronLeft size={15} /></button>
          <div className="compare-page-chips">
            {pages.map((item, itemIndex) => (
              <button
                key={item.number}
                className={itemIndex === boundedIndex ? "active" : ""}
                aria-pressed={itemIndex === boundedIndex}
                title={item.heading}
                onClick={() => goTo(itemIndex)}
              >
                {item.number}
              </button>
            ))}
          </div>
          <button className="compare-step" disabled={boundedIndex === pages.length - 1} onClick={() => goTo(boundedIndex + 1)} title="Next page" aria-label="Next page"><ChevronRight size={15} /></button>
        </div>
        <button className="compare-close" onClick={onClose} title="Close comparison" aria-label="Close comparison"><X size={15} /></button>
      </header>

      <div className={`compare-body ${direction}`} key={page.number}>
        <section className="compare-pane compare-source" aria-label={`Handwritten source page ${page.number}`}>
          <header>
            <span className="compare-pane-badge source">Source</span>
            <small>{page.imageName}</small>
          </header>
          <div className="compare-pane-scroll">
            <SourcePageImage vaultPath={vaultPath} imagePath={page.imagePath} imageName={page.imageName} assetRevision={assetRevision} />
          </div>
        </section>

        <section className="compare-pane compare-rendered" aria-label={`Rendered note page ${page.number}`}>
          <header>
            <span className="compare-pane-badge rendered">Rendered</span>
            <small>{page.heading}</small>
            <span className="compare-snapshot-mark"><Camera size={11} />Snapshot</span>
          </header>
          <div className="compare-pane-scroll">
            <div className="compare-snapshot">
              <div className="compare-snapshot-chrome"><i /><i /><i /><span>{page.heading} · Rendered view</span></div>
              <div className="compare-snapshot-canvas">
                <RichMessage
                  content={page.content}
                  vaultPath={vaultPath}
                  notePath={notePath}
                  assetRevision={assetRevision}
                  selectable={Boolean(onTextSelect)}
                  selectedFigure={selectedFigure}
                  onTextSelect={onTextSelect}
                  onFigureSelect={onFigureSelect}
                />
              </div>
            </div>
          </div>
        </section>
      </div>

      <footer className="compare-footer">
        Comparing page {boundedIndex + 1} of {pages.length} · {onFigureSelect
          ? "Select text or click a figure in the rendered pane to scope the next edit."
          : onTextSelect
            ? "Highlight text in the rendered pane to ask about that passage."
            : "The rendered pane shows exactly what the note view displays."}
      </footer>
    </article>
  );
}

export default memo(PageComparison);
