---
name: note-validation
description: Validate changed Obsidian notes and their assets with parsed Markdown, YAML, LaTeX, links, embeds, Mermaid blocks, image metadata, and detailed Excalidraw scene checks. Use after APPEND_RECONSTRUCTION, INSERT_PLAIN_CONTENT, EDIT_NOTE, or EDIT_SELECTED_NOTE before reporting completion.
---

# Note Validation

Apply the author-editor role contract first and run only checks relevant to the completed operation.

## Load the references

Read these for every validation:

- [validation-profiles.md](references/validation-profiles.md) to select the relevant mode and repair boundary.
- [check-matrix.md](references/check-matrix.md) to map each check to parser evidence.

## Use the scripts

Resolve the validator path relative to this `SKILL.md` (the agent runs with the
vault as its working directory), and keep its optional report outside the
vault. In the command below, `<note-validation-skill>` is the absolute directory
containing this file:

```bash
node <note-validation-skill>/scripts/validate_note.mjs --vault <vault-root> --note <target-note> --json /tmp/note-static.json
```

## Validation workflow

1. Select the validation profile from the completed task mode.
2. Run `validate_note.mjs`.
3. Fix errors only inside content or assets authorized for this runtime.
4. Rerun until it exits successfully.
5. Record relevant checks as `PASS`, `FAIL`, or `NOT_APPLICABLE`.

## Claim discipline

- Parser success proves structural, syntax, and path properties only.
- Mermaid static checks do not prove Obsidian layout or visual readability.
  Render and inspect changed Mermaid or other layout-sensitive visuals when a
  suitable renderer is available; otherwise report that limitation.
- Do not repair pre-existing content merely because validation discovered an unrelated problem.

## Completion conditions

Validation passes when every relevant parser check succeeds and no checklist item remains failed.
