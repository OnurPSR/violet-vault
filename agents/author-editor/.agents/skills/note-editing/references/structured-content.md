# Structured Content Editing

## Frontmatter

- Edit frontmatter only when the request targets metadata or the change requires a specific metadata dependency.
- Preserve property spelling, order, scalar/list style, and unrelated values.
- Replace the complete YAML value when a character-level edit would create ambiguous syntax.
- Do not add empty properties or speculative tags.

## Headings, lists, and callouts

- Preserve heading depth unless hierarchy is part of the request.
- Treat heading renames separately from moving their content.
- Preserve list nesting, numbering intent, and task states.
- Keep callout type, title, fold state, and blockquote markers aligned across the complete callout.
- Do not use tables, callouts, or headings merely to decorate ordinary prose.

## Tables, links, and embeds

- Keep Markdown-table column counts and delimiter rows consistent.
- Use a table only for genuine row-column data, not page layout.
- Preserve wikilink aliases, headings, and block references unless the target changes.
- Resolve a new target before creating or changing a link.
- Keep embed size parameters and captions unless the request changes their presentation.
- Preserve non-embedded handwritten source-page links in their page-ending position during unrelated edits.

## Equations and notation

- Edit the smallest complete MathJax expression or derivation environment.
- Preserve equality versus approximation, arrow direction, operator order, dimensions, and notation conventions outside the requested change.
- Keep delimiters, braces, environments, subscripts, and superscripts balanced.
- Apply a notation rename consistently within the resolved mathematical scope.
- Use the reconstruction matrix rules when changing between a small LaTeX matrix and a large spatial matrix.

## Code

- Preserve the fence language, indentation, comments, visible types, shapes, parameters, and return behavior unless targeted.
- Do not modernize APIs, complete fragments, or change conceptual pseudocode into executable code without an explicit request.
- Keep explanatory annotations outside the fence unless they are code comments in the source.
- When a rename affects code and nearby prose, update both only when both are inside the resolved boundary.

## Fenced-block safety

When editing code, Mermaid, or another fenced block, rewrite the complete containing block if needed to preserve matching fences. Do not let a fence expansion absorb neighboring prose.
