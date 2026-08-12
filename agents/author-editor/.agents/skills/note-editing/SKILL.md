---
name: note-editing
description: Edit existing Obsidian notes with tightly resolved scope, minimal coherent changes, and preservation of surrounding meaning and structure. Use for EDIT_NOTE and EDIT_SELECTED_NOTE work involving rewriting, correction, restructuring, formatting, equations, code, tables, links, embeds, Mermaid blocks, Excalidraw figures, or other existing note content.
---

# Note Editing

Apply the author-editor role contract first. Use this skill only for editing mechanics delegated by that contract; do not restate or replace its mode, authorization, fidelity, validation, or reporting rules.

## Load the references

Read these for every edit:

- [scope-resolution.md](references/scope-resolution.md) to resolve the writable boundary from the request, target note, and selection.
- [change-design.md](references/change-design.md) to plan the smallest complete transformation and preserve source-derived meaning.

Read these only when the affected content requires them:

- [structured-content.md](references/structured-content.md) for frontmatter, headings, lists, callouts, tables, links, equations, or code.
- [visual-assets.md](references/visual-assets.md) for image embeds, Mermaid, Excalidraw, SVG exports, or spatial layouts.

When editing or converting a renderer-specific visual, also read the applicable reconstruction reference:

- [Excalidraw rules](../handwritten-note-reconstruction/references/excalidraw.md)
- [Mermaid rules](../handwritten-note-reconstruction/references/mermaid.md)
- [LaTeX and matrix rules](../handwritten-note-reconstruction/references/latex-and-matrices.md)
- [Visual-transfer rules](../handwritten-note-reconstruction/references/visual-transfer.md)

## Editing workflow

1. Resolve the exact target note and active edit mode.
2. Read the entire selected scope, its containing structure, and enough surrounding context to preserve references, terminology, and intent.
3. State internally the requested outcome, writable boundary, preserved invariants, and structures or assets that must change together.
4. Classify the edit:

   | Edit type | Required treatment |
   | --- | --- |
   | Wording or tone | Change prose only; preserve claims and structure unless requested |
   | Correction or modernization | Change the identified claim, notation, or code and retain source/editor distinction when relevant |
   | Restructuring | Move or reformat only the resolved content and its necessary attachments |
   | Structured syntax | Edit the complete syntactic unit while preserving unaffected members |
   | Visual change | Update the semantic visual unit, its attached text, editable source, export, and embed as applicable |
   | Repeated note-wide change | Resolve every in-scope occurrence first, then apply consistently |

5. When multiple independent parts are selected, process them separately in selection order. For each part, complete its visual edit first and its paragraph edit second before moving to the next part; skip any edit type not requested and do not batch parts together.
6. Apply one minimal coherent edit. Do not mix opportunistic cleanup into the requested transformation.
7. Re-read the modified region with its neighbors and reconcile only dependencies made stale by the edit.

## Write-boundary rules

For `EDIT_SELECTED_NOTE`, treat the exact selection range as the default write boundary. Read outside it freely for context, but preserve unselected content. When the selection cuts through an atomic Markdown or visual structure, edit the smallest containing unit only as required to keep it valid; preserve its unselected content unchanged.

For `EDIT_NOTE`, resolve the smallest unique note region that satisfies the request. A note-wide request may make the entire note the writable boundary, but a request naming one heading, equation, figure, or phrase does not.

## Coherent-change rules

- Preserve content outside the writable boundary byte-for-byte when practical; preserve it semantically in all cases.
- Expand the changed surface only for syntax, references, labels, exports, or other dependencies that would otherwise become stale or invalid.
- Keep labels and explanations inside their figure when they identify visual elements.
- Preserve existing page-image evidence and page boundaries unless the user explicitly asks to change them.
- Do not delete an asset merely because an edit makes it unreferenced; report a possible orphan instead.
- Do not convert between Markdown, LaTeX, Mermaid, and Excalidraw unless requested or necessary to express the requested meaning reliably.

## Completion conditions

The edit is ready for validation only when the requested transformation is complete in the intended scope, unrelated content remains unchanged, every affected structure is internally coherent, and every changed visual source, export, label, and embed agrees.
