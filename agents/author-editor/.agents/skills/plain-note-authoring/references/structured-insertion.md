# Structured Insertion

## Headings, lists, and callouts

- Choose a heading one level below its intended parent unless the local hierarchy establishes another pattern.
- Do not insert a heading that unintentionally captures existing following content; place it at a resolved block boundary.
- Match list marker, indentation, numbering intent, and task syntax when continuing a list.
- Exit a list or callout with a valid blank-line boundary before starting independent content.
- Use a callout only for a real semantic role; do not wrap ordinary prose decoratively.

## Tables, links, and embeds

- Insert a complete table with a consistent column count and delimiter row.
- Do not use a table to create a multi-column page layout.
- Preserve the surrounding wikilink and Markdown-link style.
- Resolve link targets and asset paths before inserting links or embeds.
- Put an embed on its own line when inline placement would make parsing or reading ambiguous.

## Equations and notation

- Use inline math inside prose and display math for focal expressions or derivations.
- Match notation already defined in the containing section.
- Keep delimiters, braces, environments, subscripts, and superscripts balanced.
- Use LaTeX for small self-contained matrices and Excalidraw for large or spatially annotated matrices.
- Keep a derivation in one coherent block rather than scattering steps around existing content.

## Code and fenced blocks

- Use the correct language fence or identify conceptual material as pseudocode.
- Include only code required by the request; do not turn a fragment into an unsolicited full program.
- Keep visible shapes, types, parameters, return values, and explanatory comments coherent.
- Insert complete matching fences and leave neighboring prose outside them.
- Choose a fence length that does not collide with fence markers inside the new content.

## Boundary spacing

- Use one blank line between independent block structures unless local syntax requires otherwise.
- Do not add blank lines inside a table, YAML value, or tightly coupled fenced structure.
- Preserve the note's newline style and avoid changing trailing whitespace outside the insertion boundary.
