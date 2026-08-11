# Scope Resolution

## Resolve the runtime inputs

Identify:

- the exact target note path;
- the requested transformation;
- the active selection range, selected text, note revision fingerprint, and
  surrounding anchors, when present;
- explicitly named headings, figures, equations, phrases, or properties;
- whether the request applies once, within a section, or throughout the note.

When source offsets are supplied, confirm that the current note revision and
text at those offsets still match the selection. If offsets are unavailable or
stale, relocate only from a unique exact match that agrees with the supplied
prefix and suffix anchors. Rendered-only or ambiguous selections do not define
an exact write range; resolve a unique structural unit from the user's request
or ask before modifying it.

## Determine the writable boundary

For a selected edit, begin with the exact selection. For an unselected edit, choose the smallest uniquely identified region that can produce the complete requested result.

Use this priority:

1. an explicit range or exact selected content;
2. an explicitly named block, heading, figure, or property;
3. a unique exact phrase with surrounding context;
4. a unique structural or semantic match;
5. a broader section or note-wide scope only when the request requires it.

Do not choose among multiple plausible matches silently.

## Resolve compound requests

Break a multi-part request into ordered edits with independent boundaries. Apply each once, then use the updated note as context for the next operation. Merge overlapping boundaries before writing so one change does not undo another.

Record material scope assumptions for the completion report; do not insert audit commentary into the note unless requested.
