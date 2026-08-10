# Validation Profiles

## Capture provenance before writing

Create a baseline of the target note and every pre-existing asset that may be touched. Store it at a unique runtime path outside the vault and never overwrite it. A post-write snapshot cannot prove preservation.

Use the original byte offsets recorded before mutation:

- **Append:** allow only the zero-length range at original end-of-file.
- **Cursor insertion:** allow only the zero-length range at the original cursor byte offset.
- **Selected edit:** allow only the original selected or smallest authorized atomic range.
- **Note edit:** allow only the explicitly resolved original ranges.

Snapshot newly planned asset paths too. Mark them with `--allow-new` during scope validation; mark an authorized existing visual source with `--allow-change` only when the request permits changing it.

## APPEND_RECONSTRUCTION

Require all content-fidelity, spatial-fidelity, Obsidian-integrity, LaTeX, and visual-quality checks. Use append scope and compare every source page at full resolution. Confirm that each page section ends with its correct source image.

## INSERT_PLAIN_CONTENT

Use insert scope at the original cursor or append scope for explicit note-end insertion. Apply source-fidelity checks only to supplied source material. Validate new structures and visuals plus both insertion boundaries.

## EDIT_SELECTED_NOTE

Use edit scope for the original selection or authorized containing atomic structure. Validate changed syntax, dependencies, and visual assets. Do not fix validation failures outside the authorized range.

## EDIT_NOTE

Use one or more edit ranges resolved before writing. Apply fidelity and visual checks to affected regions and dependencies. Leave unrelated pre-existing failures unchanged and report them separately when material.

## Validation repair boundary

The validator may revise or remove only content created by the agent during the current runtime or content already authorized by the user's edit request. Regenerated exports may replace their previous versions only when their editable sources are inside the same authorized operation.

If a required repair lies outside that boundary, stop repairing, keep the failed check visible, and request authorization rather than broadening the edit.
