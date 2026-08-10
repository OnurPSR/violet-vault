# Excalidraw Reconstruction

## Select Excalidraw

Use Excalidraw when exact or relative placement carries meaning: geometry, axes, curves, annotated vectors, braces, irregular clusters, spatial analogies, free-form architectures, page-scale compositions, or large annotated matrices and tensors.

Do not use it for a linear list, a plain equation, or a graph whose meaning is fully expressed by nodes and directed edges.

## Construct the figure

- Start from the source region's aspect ratio and normalized bounds.
- Establish major containers and axes before adding details.
- Preserve relative placement and approximate scale among semantic units.
- Group each semantic unit and bind labels or arrows where supported.
- Put all attached labels, formulas, captions, brace text, and annotations inside the drawing.
- Use LaTeX formula elements for mathematical labels when supported and visually reliable.
- Keep connector endpoints unambiguous; avoid arrows crossing unrelated labels.
- Preserve visible values and labels. Use ellipses only when the source does or when an omission is explicitly marked as representative.

## Use a restrained visual system

- Neutral gray: containers, axes, and secondary structure.
- Blue: data, inputs, or representations.
- Violet: parameters, transformations, or learned components.
- Teal: outputs, results, or conclusions.
- Amber: source uncertainty or cautions.

Use consistent stroke width, font family, arrowheads, corner radius, and internal padding. Ensure sufficient contrast in the vault's active light and dark appearances; do not rely on color alone.

## Store and embed assets

- Follow the target vault's established Excalidraw and SVG directories and naming pattern.
- Preserve the editable `.excalidraw` source.
- Export an SVG from the completed drawing and embed the SVG inline in the note.
- Use an embed width proportional to the figure's source prominence; avoid arbitrary one-size widths.
- Keep the source and SVG names paired and unambiguous.
- Do not create an embed until both the source drawing and SVG export exist.

## Check the rendered figure

Confirm that:

- the SVG contains the complete canvas without clipping;
- labels remain inside or attached to their intended elements;
- mathematical notation is legible at the embedded width;
- relative scale and reading direction match the source;
- strokes, text, and fills remain readable in the relevant theme;
- the editable source and exported SVG depict the same revision.

If the required Excalidraw creation or export path is unavailable, do not imitate an Excalidraw embed with a placeholder file. Leave the note free of dead assets and report the missing capability.
