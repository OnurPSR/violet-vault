---
name: handwritten-note-reconstruction
description: Reconstruct handwritten source pages as page-aware Obsidian Markdown with spatially faithful visuals, equations, matrices, Mermaid diagrams, Excalidraw assets, and per-page handwritten-source links. Use for APPEND_RECONSTRUCTION work when handwritten page images must be transferred into a target note without flattening their layout or visual relationships.
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

## Inputs

This mode receives three inputs:

- `image_paths`: ordered handwritten page-image paths; required.
- `note_file_path`: target note path relative to the vault; required.
- `prompt`: additional reconstruction instructions; optional.

Keep these mode-specific names here: Violet Vault supplies the values, the author-editor contract selects `APPEND_RECONSTRUCTION`, and this skill consumes them.

## Asset path conventions

Use the following vault-relative locations as the Violet Vault default.

- Source images: `attachments/{note_name}/notes/{image}`
- Editable Excalidraw sources: `attachments/{note_name}/excalidraw_md/{figure}.excalidraw.md`
- Exported Excalidraw SVGs: `attachments/{note_name}/excalidraw_img/{figure}.svg`

## Reconstruction workflow

1. Resolve `note_file_path`, preserve the order of `image_paths`, and apply `prompt` when present.
2. Inspect every source page at full available resolution before writing. Build a page map and identify cross-page continuations.
3. Recover each page's reading graph from connectors, containment, alignment, numbering, and only then geometric reading order.
4. Divide the target content into numbered page sections. Reconstruct one source page within each corresponding section.
5. Preserve the page's visual hierarchy with Markdown structure and purpose-built visuals, applying the role contract's fidelity principles to each semantic unit.
6. Choose the least complex renderer that preserves the source meaning:

   | Source region | Renderer |
   | --- | --- |
   | Linear prose, headings, lists, or code | Markdown |
   | Equations, derivations, or a small self-contained matrix | LaTeX |
   | Directed process, hierarchy, state, sequence, or dependency logic | Mermaid |
   | Geometry, free placement, coordinate space, irregular grouping, large annotated matrix, or layout-sensitive figure | Excalidraw |
   | Page whose meaning depends on its global placement | Page-scale Excalidraw reconstruction plus concise Markdown |

7. Create and verify every referenced asset before embedding it. Store editable Excalidraw sources and their SVG exports according to the asset path conventions.
8. Close each page section according to the page-section contract below.

## Page-section contract

Use this structure unless the target note already has a compatible page convention:

```markdown
## Page 1

<!-- reconstruction of source page 1 -->

[View handwritten source page 1](attachments/{note_name}/notes/{image})

## Page 2

<!-- reconstruction of source page 2 -->

[View handwritten source page 2](attachments/{note_name}/notes/{image})
```

Derive `{note_name}` from the target note basename and preserve the source image filename when it is safe and unambiguous. Use the vault's exact path casing.

## Representation decisions

- Treat a visual as one semantic unit when its meaning depends on proximity, alignment, containment, arrows, braces, or shared scale.
- Put text in Markdown only when detaching it from a figure does not change what it refers to.
- Prefer faithful topology and relative scale over pixel imitation. Preserve the source's important placement while regularizing spacing enough to remain readable.
- Do not use a Markdown table to simulate free placement, Mermaid to simulate geometry, or Excalidraw to decorate a simple linear passage.
- Keep additions that aid navigation visually subordinate to source-derived content.

## Completion conditions

The reconstruction is ready for validation only when every source page has exactly one corresponding page section, every intended figure is present, and every section satisfies the page-section contract.
