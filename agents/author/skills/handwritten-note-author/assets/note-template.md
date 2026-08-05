# Note frame (new notes only)

Use this frame when **creating** a note and it does not conflict with a
validated vault convention. When appending to an existing note, do not add or
modify frontmatter — put provenance in the appended block instead
(`provenance-callout.md`).

Adapt `domain`, tags, and section names to the actual topic. Do not emit empty
properties, empty callouts, or empty sections. `status` follows
`references/validation.md`, section 5: `draft` until the corresponding check
actually passed.

```markdown
---
type: study-note
domain: theoretical-ai
source: handwritten
source-images:
  - "[[Attachments/attn-p1.jpg]]"
  - "[[Attachments/attn-p2.jpg]]"
status: draft
tags:
  - ai
---

# Note title

<!-- agent-block:start id=20260805T141200Z-9f3ac1 -->

> [!note]- Provenance
> (see provenance-callout.md)

## Faithful reconstruction

<!-- Source-derived content. Order, grouping, and emphasis follow the page. -->

## Added commentary

<!-- Optional. Anything not on the page lives here, clearly marked as added. -->

<!-- agent-block:end id=20260805T141200Z-9f3ac1 -->
```

The `Added commentary` heading is omitted entirely when nothing was added. The
faithful core and any commentary must remain visually separable — a reader
should never have to guess which came from the page.
