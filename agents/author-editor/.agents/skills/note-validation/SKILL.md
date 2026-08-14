---
name: note-validation
description: Validate changed Obsidian notes with parsed Markdown, YAML, LaTeX, links, and embeds, plus optional rendered comparison of created or regenerated figures. Use after APPEND_RECONSTRUCTION, INSERT_PLAIN_CONTENT, EDIT_NOTE, or EDIT_SELECTED_NOTE before reporting completion.
---

# Note Validation

Apply the author-editor role contract first and run only checks relevant to the completed operation.

## Load the references

Read these for every validation:

- [validation-profiles.md](references/validation-profiles.md) to select the relevant mode and repair boundary.
- [check-matrix.md](references/check-matrix.md) to map each check to parser evidence.

When visual verification is on and the task created or regenerated a figure,
also read [visual-verification.md](references/visual-verification.md) and apply
it to every such figure. When it is off, report visual verification as
`NOT_RUN`.

## Use the scripts

Resolve the validator path relative to this `SKILL.md` (the agent runs with the
vault as its working directory), and keep its optional report outside the
vault. In the command below, `<note-validation-skill>` is the absolute directory
containing this file:

```bash
node <note-validation-skill>/scripts/validate_note.mjs --vault <vault-root> --note <target-note> --json /tmp/note-structure.json
```

## Validation workflow

1. Select the validation profile from the completed task mode.
2. Run `validate_note.mjs`.
3. Fix structural errors only inside content or assets authorized for this runtime, then rerun the validator.
4. Apply the current run's visual-verification setting.
5. Classify relevant checks as `PASS`, `FAIL`, `INCOMPLETE`, `NOT_RUN`, or `NOT_APPLICABLE`.

## Claim discipline

- Parser success proves only the nonvisual structural, syntax, and path properties listed in `check-matrix.md`; the script does not validate figure contents or appearance.
- Do not report visual verification as `PASS` without a rendered comparison.
- Do not repair pre-existing content merely because validation discovered an unrelated problem.

## Completion conditions

Validation passes when all checks required by the current run's validation settings pass.
