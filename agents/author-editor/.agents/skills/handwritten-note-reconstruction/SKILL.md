---
name: handwritten-note-reconstruction
description: Reconstruct handwritten source pages as page-aware Obsidian Markdown with spatially faithful visuals, equations, matrices, Mermaid diagrams, Excalidraw assets, and per-page source-image embeds. Use for APPEND_RECONSTRUCTION work when handwritten page images must be transferred into a target note without flattening their layout or visual relationships.
---

# Handwritten Note Reconstruction

Apply the author-editor role contract first. Use this skill only for the reconstruction mechanics that contract delegates; do not restate or replace its mode, authorization, fidelity, validation, or reporting rules.

## Load the references

Read these before reconstructing any page:

- [page-mapping.md](references/page-mapping.md) for source capture, page order, scale, coordinates, page numbering, and source-image placement.
- [visual-transfer.md](references/visual-transfer.md) for facsimile-versus-intuitive formatting, prominence, grouping, and attached text.

Then read only the renderer references needed by the source:

- [excalidraw.md](references/excalidraw.md) before creating or changing an Excalidraw figure.
- [mermaid.md](references/mermaid.md) before writing a Mermaid block.
- [latex-and-matrices.md](references/latex-and-matrices.md) before transcribing mathematical notation or deciding how to render a matrix or tensor.

## Reconstruction workflow

1. Resolve the target note, ordered source batch, and the vault's existing attachment and diagram conventions.
2. Inspect every source page at full available resolution before writing. Build a page map and identify cross-page continuations.
3. Recover each page's reading graph from connectors, containment, alignment, numbering, and only then geometric reading order.
4. Divide the target content into numbered page sections. Reconstruct one source page within each corresponding section.
5. Preserve the page's visual hierarchy with Markdown structure and purpose-built visuals. Keep semantically attached labels, formulas, and annotations inside their figure.
6. Choose the least complex renderer that preserves the source meaning:

   | Source region | Renderer |
   | --- | --- |
   | Linear prose, headings, lists, or code | Markdown |
   | Equations, derivations, or a small self-contained matrix | LaTeX |
   | Directed process, hierarchy, state, sequence, or dependency logic | Mermaid |
   | Geometry, free placement, coordinate space, irregular grouping, large annotated matrix, or layout-sensitive figure | Excalidraw |
   | Page whose meaning depends on its global placement | Page-scale Excalidraw reconstruction plus concise Markdown |

7. Create and verify every referenced asset before embedding it. Preserve editable Excalidraw sources and embed their SVG exports.
8. End each page section with that page's source image at `attachments/{note_name}/{image}`. Place no reconstruction content between this embed and the next page heading.
9. Run the separate note-validation workflow on the note, embeds, math, and rendered visuals affected by the reconstruction.

## Page-section contract

Use this structure unless the target note already has a compatible page convention:

```markdown
## Page 1

<!-- reconstruction of source page 1 -->

![[attachments/{note_name}/{image}]]

## Page 2

<!-- reconstruction of source page 2 -->

![[attachments/{note_name}/{image}]]
```

Derive `{note_name}` from the target note basename and preserve the source image filename when it is safe and unambiguous. Use the vault's exact path casing. Copy a source image into the attachment location; never move or rewrite the supplied source.

## Representation decisions

- Treat a visual as one semantic unit when its meaning depends on proximity, alignment, containment, arrows, braces, or shared scale.
- Put text in Markdown only when detaching it from a figure does not change what it refers to.
- Prefer faithful topology and relative scale over pixel imitation. Preserve the source's important placement while regularizing spacing enough to remain readable.
- Do not use a Markdown table to simulate free placement, Mermaid to simulate geometry, or Excalidraw to decorate a simple linear passage.
- Keep additions that aid navigation visually subordinate to source-derived content.

## Completion conditions

The reconstruction is ready for validation only when every source page has exactly one corresponding page section, every intended figure is present and readable, each figure retains its attached text, and each page section ends with the correct source-image embed.
