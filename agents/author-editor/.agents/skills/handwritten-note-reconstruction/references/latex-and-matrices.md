# LaTeX, Matrices, and Tensors

## Transcribe mathematical notation

Use Obsidian-compatible MathJax:

- `$...$` for inline notation;
- `$$...$$` for displayed equations;
- `aligned` for multi-step derivations;
- `bmatrix` or `pmatrix` for small matrices;
- `\text{...}` for textual mathematical labels;
- consistent vector and matrix notation such as `\mathbf{x}` and `\mathbf{W}`.

Preserve equation order, arrow direction, equality versus approximation, delimiters, subscripts, superscripts, dimensions, and operator placement. Avoid custom packages and unsupported macros.

## Decide whether a matrix is small

Use LaTeX when the complete matrix:

- remains legible at normal note width;
- has no spatially attached braces, arrows, highlights, slices, or external labels;
- does not need aggressive shrinking or a representative layout;
- functions as notation rather than as a visual object.

## Draw a large or spatial matrix

Use Excalidraw when the matrix or tensor is large, dimensioned, sliced, highlighted, indexed by surrounding labels, or used as a spatial explanation.

1. Draw the outer brackets or tensor volume with the source aspect ratio.
2. Preserve all visible semantically relevant rows, columns, cells, and slices.
3. Reproduce `\cdots`, `\vdots`, and `\ddots` only where omission is present or explicitly intended.
4. Attach dimension braces and labels to the correct side inside the figure.
5. Preserve highlighted lookups, selected rows, columns, or slices and their connectors.
6. Put attached formulas inside the figure; put an independent shape statement beside the embed as display LaTeX when useful.
7. Do not substitute invented values for unreadable or omitted entries.

Example of an independent shape statement:

```latex
$$
\mathbf{W}_E \in \mathbb{R}^{|\mathcal{V}| \times d_{\text{embed}}}
$$
```

## Keep derivations coherent

- Keep short derivations in one display block when their sequence is linear.
- Use Excalidraw when arrows branch, circle back, point into a figure, or depend on two-dimensional placement.
