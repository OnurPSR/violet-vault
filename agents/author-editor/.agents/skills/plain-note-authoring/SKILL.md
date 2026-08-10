---
name: plain-note-authoring
description: Generate and insert new plain content into an Obsidian target note at an exact cursor, before or after an identified anchor, at the end of a section, or at the end of the note. Use for INSERT_PLAIN_CONTENT work involving prose, headings, lists, callouts, equations, code, tables, links, embeds, Mermaid, Excalidraw, or other newly authored note content without rewriting existing material.
---

# Plain Note Authoring

Apply the author-editor role contract first. Use this skill only for insertion and composition mechanics delegated by that contract; do not restate or replace its mode, authorization, fidelity, validation, or reporting rules.

## Load the references

Read these for every insertion:

- [insertion-resolution.md](references/insertion-resolution.md) for cursor validation, anchors, section append, note append, and atomic insertion boundaries.
- [content-composition.md](references/content-composition.md) for fitting new content to the note without rewriting its surroundings.

Read these only when required:

- [structured-insertion.md](references/structured-insertion.md) for headings, lists, callouts, tables, links, equations, code, or fenced blocks.
- [visual-content.md](references/visual-content.md) for Mermaid, Excalidraw, SVG, image embeds, or spatial layouts.

When authoring renderer-specific content, also read the applicable reconstruction reference:

- [Excalidraw rules](../handwritten-note-reconstruction/references/excalidraw.md)
- [Mermaid rules](../handwritten-note-reconstruction/references/mermaid.md)
- [LaTeX and matrix rules](../handwritten-note-reconstruction/references/latex-and-matrices.md)
- [Visual-transfer rules](../handwritten-note-reconstruction/references/visual-transfer.md)

## Authoring workflow

1. Resolve the exact target note and requested insertion destination.
2. Validate the cursor or anchor against the current note, then read its containing structure and enough neighboring content to match meaning and format.
3. Classify the destination:

   | Destination | Placement |
   | --- | --- |
   | Exact cursor | Insert at the supplied line and character position |
   | Before or after anchor | Insert immediately outside the identified semantic block |
   | End of section | Insert after the section's existing content and before the next heading of equal or higher depth |
   | End of note | Insert after the final substantive content |

4. Define the new content's purpose, local structure, heading depth, notation, and required assets before writing.
5. Compose the insertion as one coherent fragment. Match the note's established conventions without copying accidental inconsistencies.
6. Create and verify any new assets before adding their embeds.
7. Insert the fragment exactly once. Adjust only boundary whitespace, block prefixes, or indentation required for valid local integration.
8. Re-read the inserted fragment with both neighbors and hand the result to the separate note-validation workflow.

## Cursor and append rules

- Treat an explicit cursor as authoritative when it is current and structurally compatible with the requested content.
- Preserve all text before and after an inline cursor; inserting at the cursor does not authorize replacing either side.
- Do not split frontmatter delimiters, fenced blocks, display math, tables, embeds, or visual blocks with unrelated content.
- When a cursor is inside an incompatible atomic structure, use the nearest unambiguous valid boundary only when that preserves the requested location's meaning; otherwise ask for clarification.
- Interpret “append to this section” as the end of its heading subtree, not the physical end of the file.
- Interpret “append to the note” as the end of the note, independent of the current cursor.
- In a reconstructed page section, keep the source-page image last. Append ordinary content immediately before that page-ending embed unless the user explicitly requests another location.

## Integration rules

- Preserve existing content. Do not rephrase, reorder, normalize, or repair neighboring material as part of insertion.
- Add only the minimum blank lines and prefixes needed to prevent accidental merging with surrounding blocks.
- Match local heading hierarchy, list depth, callout form, notation, link style, and embed syntax.
- Keep newly added explanation distinguishable from source-derived reconstruction when merging them would blur provenance.
- Do not create empty scaffolding, speculative frontmatter, placeholder links, dead embeds, or unverified assets.

## Completion conditions

The insertion is ready for validation only when the new content appears once at the intended destination, both neighboring regions remain unchanged, the local Markdown structure is valid, and every new asset exists and agrees with its embed.
