# Visual and Asset Editing

## Identify what is being edited

Distinguish among:

- the embed markup or displayed size;
- a caption or independent paragraph;
- labels or explanations attached to visual elements;
- the visual content itself;
- the editable source asset;
- an exported rendering such as SVG;
- a source-page image retained as evidence.

Change only the layers required by the request. An embed-path edit does not imply a visual redesign, and a visual-content edit does not imply moving its embed.

## Preserve spatial meaning

- Apply the role contract's visual fidelity principles to the complete semantic visual unit.
- Preserve the original visual's prominence in the note unless resizing is requested.
- Avoid converting a spatial figure into disconnected prose or a directed graph into decorative free-form shapes.
- Use the reconstruction visual-transfer rules when a change alters layout or representation.

## Edit Mermaid

- Modify the complete Mermaid block when node, edge, containment, or direction logic changes.
- Preserve stable node IDs where practical and update visible labels separately.
- Keep attached text in node or edge labels.
- Re-render after changes that can affect layout, wrapping, direction, or theme contrast.

## Edit Excalidraw and SVG

- Change the editable `.excalidraw` source first.
- Update all affected bound labels, connectors, groups, and mathematical elements together.
- Export a new SVG from the updated source and replace the paired export only after it succeeds.
- Keep source, SVG, and note embed naming synchronized.
- Preserve the previous usable export until the replacement has been verified.
- Do not patch the exported SVG as a substitute for updating the editable source unless the SVG itself is explicitly the canonical asset.

## Protect source images and unrelated assets

- Treat handwritten source-page images as evidence, not editable illustrations.
- Do not crop, annotate, replace, rename, move, or recompress a source image unless explicitly requested.
- Do not delete replaced or unreferenced assets automatically; report possible orphans.
- Do not create a placeholder asset or dead embed when a renderer or export path is unavailable.

## Keep representation changes deliberate

Convert between Markdown, LaTeX, Mermaid, and Excalidraw only when the requested meaning cannot be expressed reliably in the current representation or the user asks for conversion. Preserve all source semantics during conversion and keep the old asset until the new representation and embed are verified.
