# Change Design

## Define the edit before writing

Write an internal change contract with four parts:

- **Outcome:** what must be different after the edit.
- **Boundary:** which note region and assets may change.
- **Invariants:** meaning, terminology, ordering, formatting, or evidence that must remain.
- **Dependencies:** links, labels, numbering, exports, or references that must change together.

Use this contract to reject unrelated cleanup.

## Choose the smallest complete transformation

- For wording edits, preserve technical claims, examples, order, and emphasis.
- For shortening, remove redundancy before removing qualifiers, assumptions, or evidence.
- For expansion, add only content supported or explicitly requested; match the local level of detail.
- For restructuring, preserve the original reading graph unless the user asks to change it.
- For terminology changes, distinguish a local replacement from a consistent note-wide rename.
- For deletions, remove only the named content and repair the local sentence, list, or structure it leaves behind.

Do not rewrap paragraphs, reorder properties, normalize punctuation, or reformat untouched blocks merely because another style is possible.

## Edit source-derived material carefully

- Preserve uncertainty markers and source qualifications unless the request explicitly resolves or removes them.
- When correcting a source-derived claim, make the requested correction without making the original provenance ambiguous.
- Keep editor-added explanation visibly distinguishable when merging it into faithful reconstruction would misrepresent the source.
- Do not convert an incomplete code fragment, proof, or derivation into a complete one unless completion is requested.

## Reconcile dependencies narrowly

Update a dependency only when the edit makes it stale. Typical dependencies include:

- intra-note heading links after a heading rename;
- local numbering after inserting, removing, or moving an item;
- figure labels and prose references after a visual change;
- an Excalidraw SVG export after changing its source;
- an embed path after an authorized rename or relocation;
- repeated notation within the resolved mathematical scope.

Do not expand into other notes, backlinks, or assets without authorization. Report likely external follow-up when the target-note edit may leave it necessary.

## Review the resulting diff

Compare the final changed surface with the change contract. Every changed line or asset should be requested, required for structural validity, or required to reconcile a stale dependency.
