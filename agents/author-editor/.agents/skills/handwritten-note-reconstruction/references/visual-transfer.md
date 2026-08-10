# Visual Transfer

## Use layered spatial fidelity

Build two restrained layers:

- **Faithful core:** retain source order, grouping, emphasis, topology, and attached annotations.
- **Study scaffold:** add only enough consistent Markdown structure to make the reconstruction navigable.

The result should read like an intuitive digital facsimile: recognizably the same page, but aligned and legible rather than imitating every hand-drawn irregularity.

## Map prominence

Classify each region before formatting it:

| Level | Source role | Typical transfer |
| --- | --- | --- |
| P1 focal | page title, central model, dominant equation | page heading, largest embed, or display math |
| P2 major | principal figure, matrix, derivation, section | subsection or prominent visual |
| P3 supporting | explanation, example, local formula | paragraph, list, or local visual block |
| P4 annotation | margin note, correction, reminder | compact annotation near its referent |

Do not promote a small annotation into a major section or shrink a focal figure to ordinary body size.

## Preserve spatial meaning

- Keep aligned alternatives parallel and ordered.
- Keep nested content inside its original conceptual container.
- Preserve left/right, above/below, input/output, and center/periphery relationships when they convey meaning.
- Preserve meaningful relative widths and distances; ignore accidental pen jitter.
- Keep arrows, braces, highlights, circles, and underlines only when they signal a relationship or emphasis.
- Reconstruct a globally spatial page as one page-scale Excalidraw composition rather than fragmenting it into unrelated blocks.

## Keep text attached to figures

Include titles, captions, axis labels, edge labels, formulas, brace captions, legends, and nearby explanatory phrases inside the Mermaid or Excalidraw figure when their placement identifies a referent.

Move text outside a figure only when it is an independent paragraph. If moving the text would make “this,” “here,” a color, an arrow, or a position ambiguous, it belongs in the figure.

## Apply restrained formatting

- Use headings and callouts only when the source already gives the content that role.
- Use bold for a defined term or pivotal transition, not for whole paragraphs.
- Use color to distinguish semantic roles, not to reproduce incidental pen colors.
- Prefer neutral structure with a small set of consistent accent colors.
- Avoid decorative emoji, layout tables, nested callouts, repeated dividers, and theme-dependent HTML.

## Handle difficult compositions

- **Two columns:** preserve independent column order and their relationship; use one visual when Markdown would interleave them incorrectly.
- **Margin annotation:** place it near its referent inside the visual or as a compact adjacent annotation.
- **Cross-page continuation:** end the first page at the actual boundary and resume under the next page heading.
- **Mixed prose and figure:** keep independent prose in Markdown and embed the complete labeled figure at the corresponding point in the reading graph.
- **Dense page:** prefer one coherent page-scale visual plus short searchable text over many disconnected miniature diagrams.
