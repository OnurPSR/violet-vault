# Page Mapping and Source Images

## Capture the source faithfully

- Inspect the original image, not a compressed preview.
- Record pixel width, height, orientation, visible page boundary, and source order.
- Rotate only when the intended orientation is clear. Keep any corrected or enhanced image as a derivative; do not overwrite the supplied source.
- Do not crop marginal writing, page numbers, connector endpoints, or blank space that establishes grouping.
- Retain the complete handwritten page image as source evidence. Use crops only as temporary inspection aids.

## Build the page map

For each region, record internally:

- normalized bounds `(x / page_width, y / page_height, width / page_width, height / page_height)`;
- type: text, equation, code, table, matrix, figure, label, annotation, or connector;
- transcription or visual description;
- connected and contained regions;
- visual prominence and reading predecessors;
- legibility or uncertainty relevant to placement.

Use normalized bounds to compare placement and scale across pages. Do not print coordinates in the note.

## Recover order and grouping

Resolve reading order in this priority:

1. connector or arrow direction;
2. containment, braces, and enclosure;
3. alignment and adjacency;
4. explicit numbering;
5. conventional mathematical order;
6. top-to-bottom, then left-to-right fallback.

Treat a label beside an axis, text inside a box, a formula under a brace, and a note reached by an arrow as part of the connected visual unit.

## Preserve relative scale

- Keep the page aspect ratio when using a page-scale reconstruction.
- Map region size proportionally before applying readability adjustments.
- Keep dominant figures dominant and marginal notes marginal.
- Preserve meaningful whitespace, overlap, alignment, and side-by-side relationships.
- Regularize hand-drawn wobble and inconsistent spacing only when the relationship remains unchanged.

## Number and attach pages

- Preserve a handwritten page number inside the reconstruction when it differs from batch order; do not use it to silently reorder the batch.
- Continue a cross-page sentence or derivation in the next page section while preserving the page boundary.
- Close reconstructed page sections using the reconstruction skill's page-section contract.
- Do not reuse one page image for multiple page sections or attach an unverified image by basename alone.
