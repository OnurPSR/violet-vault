---
name: note-validation
description: Validate changed Obsidian notes and their assets with automated fidelity proxies, path and syntax checks, byte-level change-scope verification, arithmetic and matrix checks, and mandatory real-Obsidian Reading-view inspection. Use after APPEND_RECONSTRUCTION, INSERT_PLAIN_CONTENT, EDIT_NOTE, or EDIT_SELECTED_NOTE before reporting completion.
---

# Note Validation

Apply the author-editor role contract first. Validate only checks relevant to the completed operation, but never substitute static Markdown preview for required Obsidian rendering.

## Load the references

Read these for every validation:

- [validation-profiles.md](references/validation-profiles.md) to select the relevant mode, baseline, and repair boundary.
- [check-matrix.md](references/check-matrix.md) to map every required check to automated or visual evidence.

Read [obsidian-rendering.md](references/obsidian-rendering.md) whenever the note contains or changes visual layout, MathJax, Mermaid, Excalidraw, images, callouts, or theme-sensitive presentation.

## Use the scripts

Run scripts instead of repeatedly reading the whole note into context:

- `scripts/capture_baseline.mjs` records exact pre-write bytes and hashes. Run it before the first mutation in a combined authoring/editing workflow.
- `scripts/validate_change_scope.mjs` proves that protected bytes and snapshotted files were preserved.
- `scripts/validate_note.mjs` checks local paths, links, embeds, Excalidraw structure, Markdown structure, LaTeX balance, matrix rows, simple arithmetic, Mermaid blocks, headings, callout density, image dimensions, and risky HTML.
- `scripts/obsidian_render_check.mjs` discovers the installed official CLI, opens the target, ensures Reading view, captures console/errors, inspects rendered DOM geometry, and writes full and narrow screenshots.

Use temporary report and screenshot paths outside the vault:

```bash
node scripts/capture_baseline.mjs --vault <vault-root> --out /tmp/note-baseline-<run-id>.json --file <target-note>

node scripts/validate_note.mjs --vault <vault-root> --note <target-note> --json /tmp/note-static.json

node scripts/validate_change_scope.mjs --snapshot /tmp/note-baseline-<run-id>.json --vault <vault-root> --target <target-note> --mode append

node scripts/obsidian_render_check.mjs --vault-name <registered-vault-name> --note <target-note> --out-dir /tmp/obsidian-validation
```

For cursor insertion, pass `--mode insert --offset <original-byte-offset>`. For editing, pass `--mode edit --range <original-start-byte>:<original-end-byte>` once per authorized original range.

## Validation workflow

1. Select the validation profile from the completed task mode.
2. Confirm that a pre-write baseline exists. If it does not, run all remaining checks but mark byte-level provenance as blocked.
3. Run `validate_note.mjs`. Fix errors only inside content or assets authorized for this runtime, then rerun until it exits successfully.
4. Run `validate_change_scope.mjs` against the original baseline. Treat any protected-byte change as a failure, not as formatting cleanup.
5. Run `obsidian_render_check.mjs`; it must execute `obsidian help` first and verify the installed command set.
6. Inspect every screenshot at full resolution. Compare the note with the source pages when reconstruction fidelity applies. Inspect important Excalidraw files separately.
7. Fix only authorized content, regenerate affected exports, and repeat static, scope, and render checks until all relevant checks pass.
8. Record each checklist item as `PASS`, `FAIL`, `BLOCKED`, or `NOT_APPLICABLE` with its evidence file.

## Claim discipline

- Static success proves syntax and path properties only.
- A captured screenshot is evidence only after it has been inspected at full resolution.
- Generic Markdown, browser, or KaTeX preview does not prove Obsidian Reading-view correctness.
- Do not claim visual verification when the official Obsidian renderer could not be controlled.
- Do not repair pre-existing content merely because validation discovered an unrelated problem.

## Blocked renderer fallback

If the official CLI or running Obsidian instance cannot be accessed after the fallback attempts in `obsidian-rendering.md`, complete static and scope checks, mark Reading-view checks `BLOCKED`, and list the exact note, Excalidraw sources, and SVG/image assets requiring one-time visual inspection.

## Completion conditions

Validation passes only when every relevant automated check succeeds, source comparison checks are completed when applicable, Reading-view screenshots and console output are inspected, and no checklist item remains failed. Blocked visual checks must be reported as blocked rather than passed.
