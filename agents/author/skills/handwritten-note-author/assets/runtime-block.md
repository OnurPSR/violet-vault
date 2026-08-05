# Agent-block wrapper (canonical form)

Every piece of content this agent writes is enclosed in exactly one block. The
markers are the only definition of "content this agent owns"; there is no
implicit notion of "written during this chat".

```markdown
<!-- agent-block:start id=<unique-id> -->
...content...
<!-- agent-block:end id=<same-id> -->
```

## Identifier

- Format: `<UTC timestamp>-<6 hex chars>` — e.g. `20260805T141200Z-9f3ac1`.
  Timestamp `%Y%m%dT%H%M%SZ` makes blocks sortable and auditable; the random
  suffix removes any chance of collision within the same second.
- Pattern: `[A-Za-z0-9][A-Za-z0-9._-]{0,63}`.
- Generate with:

  ```bash
  python3 scripts/verify_append_only.py new-id
  ```

  or take the `suggested_block_id` returned by `plan`. In practice, let
  `append` generate it — passing `--block-id` is only for reusing a known id.

## Tracking

- Every id issued in a run appears in the completion report.
- `python3 scripts/validate_note.py --target <note> --list-blocks` enumerates
  the ids present in a note.
- Marker integrity is checked by `validate_note.py --check agent-blocks` and by
  `verify_append_only.py` on every write.

## Rules

- Markers sit on their own line, at column 0, with nothing else on the line.
- One start and one end per id, start before end, never nested or overlapping.
- Content outside a block issued in the **current** run is immutable
  (`../../AGENTS.md`, "Ownership, immutability, and authorization"). Blocks from
  earlier runs count as pre-existing.
- A current-run block may be revised only on request, and only with the
  outside-block invariant verified afterwards (`references/validation.md`,
  section 2).
