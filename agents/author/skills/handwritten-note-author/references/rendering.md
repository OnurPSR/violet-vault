# Rendering: renderer selection, LaTeX, diagrams, matrices

Steps 8-9 of the skill workflow. `../../AGENTS.md` remains authoritative for the
rules it owns; nothing here overrides fidelity or data preservation.

Contents:

1. [Selection principle](#1-selection-principle)
2. [Selection matrix](#2-selection-matrix)
3. [LaTeX](#3-latex)
4. [Mermaid](#4-mermaid)
5. [Excalidraw and SVG](#5-excalidraw-and-svg)
6. [Matrices and tensors](#6-matrices-and-tensors)
7. [Portability and accessibility](#7-portability-and-accessibility)

## 1. Selection principle

Choose the **simplest representation that preserves the meaning**, judged by
what the source needs — not by what looks impressive.

- A heavier renderer is justified only when the lighter one would destroy
  meaning: free placement, curved connectors, irregular grouping, geometry,
  containment, or spatial analogy.
- Excalidraw is never required when Markdown, LaTeX, Mermaid, or a plain SVG
  preserves the meaning adequately. Portable beats bespoke.
- Do not use a Markdown table to force a two-column layout. Do not use Mermaid
  for geometry or for a matrix. Do not use Excalidraw for a linear list.

## 2. Selection matrix

| Source content | Representation |
| --- | --- |
| Linear prose, definitions, short lists | Markdown |
| Short equations and derivations | Obsidian MathJax/LaTeX |
| Framework code or pseudocode | Fenced code block with a language tag |
| Genuine row-column data | Markdown table |
| Discrete process, architecture, state machine, sequence, dependency graph | Mermaid |
| Coordinate spaces, free-form geometry, annotated vectors, curved arrows, braces, irregular grouping, spatial analogies, layout-sensitive figures | Excalidraw → exported SVG |
| Large matrix or tensor with dimension braces or representative slices | Excalidraw → exported SVG, plus the machine-readable form required by section 6 |
| A page whose meaning depends globally on free placement | Full-page facsimile figure **plus** a concise structured Markdown explanation |

## 3. LaTeX

Obsidian-compatible MathJax only:

- inline `$...$`, display `$$...$$`;
- small matrices: `bmatrix`, `pmatrix`, `aligned`;
- textual labels inside math: `\text{...}`;
- one consistent convention for vectors and matrices (`\mathbf{x}`, `\mathbf{W}`);
- sets and spaces: `\mathcal{V}`, `\mathbb{R}^d`;
- no custom macros or packages Obsidian does not support.

For every equation:

1. Preserve the original expression exactly.
2. Preserve the direction and sequence of derivation arrows.
3. Preserve `\approx` versus `=`.
4. Check that delimiters, braces, environments, subscripts, and superscripts are
   balanced — `scripts/validate_note.py --check math-delimiters latex-structure`.
5. Check operator placement and that transcribed dimensions match what the page
   shows. A mismatch is *reported*, not fixed
   (`reconstruction.md`, section 7).

Arithmetic in the source is **not** recomputed as part of transcription. It may
be recomputed as a separate, optional audit, whose finding goes in a technical
check annotation and never into the transcribed expression.

Do not place display-math delimiters inside code fences. Do not rely on LaTeX
inside Mermaid labels.

## 4. Mermaid

Use when edge logic is primary and exact free placement is not.

- Match the handwritten direction: top-down, left-right, or cyclical.
- Preserve branch structure, edge direction, edge labels, and containment.
- Short node labels; quote any label containing punctuation.
- Split a diagram only when the source itself contains separable subsystems.
- Readable at a narrower viewport (400 px content width; see the Glossary).
- No fragile LaTeX in labels. Simple notation MAY use Unicode; if mathematical
  labels are essential, use Excalidraw instead.
- Mermaid blocks stay inline in the note unless the vault has a validated
  contrary convention.
- Mermaid syntax is verified by the actual Obsidian renderer when that
  capability exists. When it does not, report Mermaid rendering as `blocked`
  (`validation.md`) — never as passed.

## 5. Excalidraw and SVG

Use when spatial meaning is primary and section 1 rules out the lighter options.

**Files and naming**

- Editable source in the vault's existing Excalidraw directory — commonly
  `Diagrams/Excalidraw/{NoteName}/Markdown/`; exported SVG in
  `Diagrams/Excalidraw/{NoteName}/SVG/`. Follow the *validated* convention
  exactly (Glossary); do not invent a new layout.
- Descriptive kebab-case: `<note-slug>-<concept>`.
- Embed the exported **SVG** inline; do not embed `.excalidraw.md` directly.
- Record the relationship between the editable source and the export in the
  provenance callout, so the drawing stays editable later:

  ```markdown
  > Figure `attention-qkv`: source `Diagrams/Excalidraw/Attention/Markdown/attention-qkv.excalidraw.md`
  > → export `Diagrams/Excalidraw/Attention/SVG/attention-qkv.svg` (exported <date>).
  ```

**Drawing**

- Match the vault's existing drawing style and background.
- Restrained palette: neutral gray for structure · blue for data or
  representations · violet for learned parameters and transformations · teal for
  outputs and conclusions · amber for cautions and uncertain annotations.
- Consistent stroke width, font family, arrowheads, rounded containers.
- Preserve relative placement and approximate relative scale from the source.
- Every nearby label, formula, brace caption, and annotation goes **inside** the
  drawing; bind labels to shapes where supported so later movement cannot
  separate them; group each semantic unit.
- Use real LaTeX elements for mathematical labels where supported rather than
  imitating mathematics with Unicode.
- Add an internal link only when the referenced note actually exists.

**Before embedding**

Every diagram is created and validated *before* the embed is written. A dead
embed (`![[missing-file.excalidraw]]`), an empty file, or a placeholder file is
a failed task, not a to-do — `scripts/validate_note.py` checks
`embeds`, `empty-assets`, `svg-validity`, and `placeholders`. If the plugin or a
valid creation pattern is unavailable, do not insert a fake embed: report the
blocker and ask for the missing configuration.

## 6. Matrices and tensors

Two cases, decided by whether the individual values carry information.

**Conceptual or schematic matrix** — the source itself already implies omitted
structure (it shows ellipses, generic entries, or a shape rather than data).
Representative cells and ellipses are appropriate:

1. Draw the outer brackets or tensor volume.
2. Show a small number of representative cells, rows, columns, or slices.
3. Use `\cdots`, `\vdots`, `\ddots` where omission is intended.
4. Add dimension braces and labels; keep each label on the correct side.
5. State the shape near the figure, e.g.
   $\mathbf{W}_E \in \mathbb{R}^{|\mathcal{V}| \times d_{\text{embed}}}$.
6. Preserve any highlighted row, column, slice, or lookup operation.

**Data-bearing matrix** — the visible values are content (measurements, weights,
a worked example). Every legible value MUST be preserved in an exact, searchable
representation. Visual convenience is never a reason to drop a value.

A data-bearing matrix MAY have both:

- a visual representation (Excalidraw → SVG) carrying the spatial meaning; and
- a machine-readable transcription — Markdown table, LaTeX `bmatrix`, a
  CSV-style fenced code block, or a collapsed appendix section — carrying the
  values.

When both are present, say which is which in one line, so the duplication is not
mistaken for two different objects.

Small matrices (Glossary: at most 4 rows, at most 6 columns, rows under ~120
characters of LaTeX) stay in plain LaTeX. Above those thresholds a raw LaTeX
matrix is unreadable, so use the figure plus the machine-readable transcription.

Never fabricate a value the handwriting does not provide; an unreadable cell is
marked per `reconstruction.md`, section 6.

## 7. Portability and accessibility

- Prefer portable Obsidian features over theme-specific HTML or fragile CSS.
- When important information exists only inside a diagram, provide an
  accessible, searchable companion — descriptive alt text, a short caption
  listing the labels, or the machine-readable transcription of section 6 —
  unless doing so would create misleading duplication (e.g. implying two
  distinct figures). Prefer the smallest companion that makes the content
  findable by search.
- Embed width reflects source prominence (P1-P4) and must stay legible at a
  narrower viewport.
- Theme claims are capability-gated: state light/dark compatibility only for
  themes actually checked in this run. If only one active theme was checked,
  report exactly that and leave the other as `not requested`.
