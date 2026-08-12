# Insertion Resolution

## Resolve the destination

Identify:

- the exact target note;
- the requested new content;
- the cursor line and character position, when supplied;
- any named heading, block, phrase, or embed used as an anchor;
- whether “append” means the end of a section or the end of the note.

Validate a cursor against the current note using its line, character, and nearby text. Validate an anchor from a unique match plus its containing structure. Do not guess among duplicate anchors.

## Apply destination priority

Use this order when signals coexist:

1. an explicitly requested destination;
2. an exact current cursor;
3. an explicitly named before/after anchor;
4. an explicitly named section end;
5. note end only when append-to-note intent is clear.

A selection does not become the insertion boundary unless the user asks to modify or replace it; route that operation through note editing.

## Handle exact cursors

- At a line boundary, preserve the content on both sides and add only required separators.
- Inside a paragraph, insert inline content without changing either side; insert block content only at a compatible block boundary.
- Inside a heading, edit the heading text only when the requested insertion belongs to the heading; otherwise place content after the heading line.
- Inside a list or callout, inherit prefixes and indentation only when continuing that structure.
- Never place unrelated prose inside frontmatter, a fence, display math, table syntax, an embed, or a Mermaid block.

If a cursor is stale, relocate it only from a unique surrounding-text match. If an incompatible cursor has two equally plausible boundaries, ask rather than choosing silently.

## Append to a section

Find the named heading and its subtree. Insert after its last substantive block and before the next heading of equal or higher level.

- Keep child subsections inside the subtree.
- Insert before a page-ending, non-embedded handwritten source-page link when the section represents a reconstructed page.
- Do not append to the first same-named section when several matches exist without a unique contextual qualifier.

## Append to the note

Insert after the final substantive content while preserving the note's newline convention. Ignore trailing blank lines when locating the logical end, then leave one valid block separation around the inserted fragment.

Do not move an existing footer, source list, or terminal metadata block unless the user means “after absolutely everything.” Treat a recognized footer as an anchor and insert immediately before it when that preserves the note's established structure.
