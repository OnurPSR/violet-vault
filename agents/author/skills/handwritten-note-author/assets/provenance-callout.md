# Provenance and audit callouts (canonical forms)

Both are **collapsed callouts**: the trailing `-` in `[!note]-` tells Obsidian
to render the callout folded, so the note stays readable while the record stays
attached to the content it describes.

## Provenance

One per agent block. For a new note the same information may instead live in
frontmatter (`note-template.md`); never in both.

```markdown
> [!note]- Provenance
> Reconstructed from handwritten source pages by the Violet Vault author agent.
> Block: `20260805T141200Z-9f3ac1` · written 2026-08-05.
> Source pages, in reading order:
> 1. `Attachments/attn-p1.jpg` (user-attached)
> 2. `Attachments/attn-p2.jpg` (user-attached)
> Page order determined by: visible page numbering.
> Figures: `Diagrams/Excalidraw/Attention/Markdown/attention-qkv.excalidraw.md`
> → `Diagrams/Excalidraw/Attention/SVG/attention-qkv.svg`.
> Validation: static passed · append integrity passed · Reading-view render blocked.
```

Rules:

- When appending to an existing note, provenance goes **inside the appended
  block**. Existing frontmatter is never edited.
- Full-size source photographs are not embedded in the body unless the user asks
  for them; the paths above are the record.
- Every status word here uses the vocabulary of `references/validation.md`,
  section 5.

## Audit

One per block, only when there is something to record. Omit it entirely rather
than emitting an empty callout.

```markdown
> [!note]- Audit
> Transcription uncertainty:
> - p1, line 4: read as `d_k`; `d_h` is possible. Dominant reading transcribed.
> - p2, margin: `[illegible: batch / batches]` — both readings shown inline.
> Contextual inferences (not direct readings):
> - p2, the exponent was inferred from the surrounding derivation.
> Technically audited: not requested.
```

## Technical check

Separate from Audit, and placed next to the affected content rather than at the
end, so a reader meets the caveat where it matters. Use `[!warning]-` so it is
visible as a caveat but folded by default.

```markdown
> [!warning]- Technical check (added by the agent, not from the source)
> Transcription fidelity: verbatim, high confidence.
> Source-level audit: recomputed $3 \times 7 = 21$; the page states 22.
> The source expression above is unchanged.
```

Never merge these three. Provenance records *where content came from*, Audit
records *how confident the reading is*, Technical check records *an agent
finding about the source's own correctness*. Collapsing them loses the
distinction between "faithfully transcribed" and "mathematically verified".
