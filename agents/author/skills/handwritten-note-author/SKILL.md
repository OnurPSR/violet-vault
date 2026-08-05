---
name: handwritten-note-author
description: Reconstruct handwritten notebook or lecture pages into an Obsidian note that keeps the page's structure — a semantic-spatial facsimile with faithful transcription, LaTeX, Mermaid, and Excalidraw/SVG figures, explicit uncertainty marking, and a transactional append-only write. Use this skill whenever handwritten source pages, notebook photos, scanned lecture notes, or whiteboard captures are being turned into a note, whenever a note must preserve a page's spatial layout rather than be summarised, and whenever appending reconstructed content to an existing Obsidian note — even if the user only says "digitise this page", "add these photos to my note", or "make this readable".
compatibility: Python 3.9+ for the bundled validators. Obsidian rendering checks are optional and capability-gated.
---

# Handwritten-note author

This skill implements `reconstruct` mode for the Violet Vault author agent.

`../../AGENTS.md` is authoritative for precedence, mode selection, ownership and
immutability, path security, untrusted-source handling, completion truthfulness,
and the validation entry points. This skill does not restate those rules; it
implements the procedure that sits on top of them. If anything here appears to
conflict with `AGENTS.md`, `AGENTS.md` wins.

## Objective

Produce a **semantic-spatial facsimile**: preserve every legible statement,
symbol, number, equation, code fragment, label, arrow, brace, and grouping;
preserve the intended reading order and the relative importance of regions;
preserve meaningful proximity, alignment, scale, containment, and direction. Use
the simplest representation that keeps the meaning. Make the result pleasant to
study without paying for it in fidelity.

Two layers, always distinguishable in the output:

- **Faithful core** — follows the source page's order, grouping, and emphasis.
- **Study scaffold** — a small amount of consistent Obsidian structure
  (headings, sparse callouts, links) that helps revisiting, plus any technical
  commentary this agent adds. Commentary is marked as not being source content.

## Workflow

1. **Confirm the mode.** `reconstruct` only. Otherwise return to `AGENTS.md`.
2. **Resolve the target note** — see "Target resolution" below.
3. **Resolve the source images and their order** — see "Source selection".
4. **Inspect every page at sufficient resolution** (defined in the Glossary).
5. **Build page maps and the reading graph** — `references/reconstruction.md`.
6. **Transcribe faithfully, then normalise only what is presentation-safe** —
   `references/reconstruction.md`.
7. **Mark uncertainty explicitly** — `references/reconstruction.md`.
8. **Choose a renderer per region** — `references/rendering.md`.
9. **Create and validate every external diagram before embedding it** —
   `references/rendering.md`.
10. **Assemble the block** from `assets/note-template.md`, wrapped by
    `assets/runtime-block.md`, with provenance from
    `assets/provenance-callout.md`.
11. **Write transactionally** with `scripts/verify_append_only.py` —
    `references/validation.md`.
12. **Validate**, honestly, at whatever capability level is actually available —
    `references/validation.md`.
13. **Report** with per-item statuses — template in `references/validation.md`.

Read a reference file when you reach the step that names it, not before.

## Target resolution

Deterministic, in order. Stop at the first rule that applies:

1. A vault-relative path → use that exact path.
2. A bare note name → search for an exact filename-stem match.
3. Exactly one match → use it.
4. More than one match → stop and ask which.
5. No match → infer a folder only when exactly one existing folder is
   unambiguously appropriate given the topic and observed vault conventions.
6. Still ambiguous → stop and ask. Never guess a destination.

An existing target is appended to, never rewritten. New frontmatter is added
only when creating a new note; when appending, provenance goes in the appended
block instead (see `assets/provenance-callout.md`).

## Source selection

**Which images.** In priority order; do not silently widen the set:

1. Images explicitly attached to the current request and identified as source
   pages.
2. Images explicitly named by the user.
3. Automatic discovery in `Attachments/` — **only** after the user explicitly
   authorises it for this task.

Never process every image referenced by an existing note, and never sweep all
"new" images in `Attachments/`, on your own initiative. An attached image may
not be a source page at all (`AGENTS.md`, "Task modes").

**Which order.** In priority order:

1. The order the user gave.
2. Explicit page numbers written on the pages.
3. Capture timestamps, when reliable (EXIF `DateTimeOriginal` present, all
   pages from one device, and monotonically consistent with any visible page
   numbers).
4. Natural filename order (`page-2` before `page-10`).
5. Otherwise ask.

**Duplicates.** Deduplicate by content hash (`sha256`) before analysis when more
than three images are supplied; keep the first occurrence and note the drop.

## Vault conventions

Inspect before writing; follow conventions that are discoverable. A convention
counts as **validated** when it appears in at least one existing vault file and
a reference using it resolves under `scripts/validate_note.py`. Otherwise it is
a guess — ask rather than inventing a new layout.

Commonly present, as observation not permission to create:

```text
AI/{Coding,Theoretical AI}/   Attachments/   Backend/   Diagrams/Excalidraw/
```

Diagram file placement, naming, and the editable-source ↔ exported-SVG
relationship are in `references/rendering.md`.

## Style

Restrained, three principles: **spatial fidelity** (related words and visuals
stay together), **signaling** (headings, callouts, arrows, limited colour carry
structure and importance), **dual representation** (text explains; visuals carry
relationships, geometry, and transformation).

Callouts, only when semantically earned: `[!info] Definition` ·
`[!tip] Intuition` · `[!example] Example` · `[!warning] Caveat` ·
`[!question] Open question`. Bold marks defined terms and pivotal
transformations, not paragraphs. Avoid decorative emoji, nested callouts,
rainbow colour, and repeated horizontal rules.

Structure templates are selection guides, never permission to reorder the
source. When the page uses a different structure, the page wins.

- Theoretical AI / mathematics: core idea → objects and shapes → mechanism →
  derivation → geometric intuition → consequence.
- Code and frameworks: goal → API mental model → minimal current implementation
  → data shapes → execution flow → pitfalls.
- Backend and architecture: responsibility → components → request/data flow →
  state and persistence → failure cases.

## Glossary

Terms that must not be interpreted loosely.

| Term | Operational definition |
| --- | --- |
| sufficient resolution | Viewed at native resolution (no downscaling), the smallest handwritten glyph — including subscripts and primes — is at least ~10 px tall and readable without interpolation. Below that, treat affected regions as low confidence or request a better capture. |
| large matrix | More than 4 rows, or more than 6 columns, or any row whose LaTeX source exceeds ~120 characters. Below all three thresholds, inline LaTeX is fine. |
| data-bearing matrix | A matrix whose individual visible values carry information (measurements, weights, worked examples). Contrast: **conceptual/schematic matrix**, where the source itself already shows ellipses or generic entries. Handling differs; see `references/rendering.md`. |
| single coherent batch | Images that share one capture session: same device, contiguous page numbering or capture timestamps within two hours, and one subject. Only relevant when the user has authorised automatic discovery. |
| narrower viewport | 400 px of content width (Obsidian mobile, or a split pane). A figure is acceptable if its labels remain legible at that width. |
| collapsed audit callout | `> [!note]- Audit` — the trailing `-` makes Obsidian render it folded. Canonical form in `assets/provenance-callout.md`. |
| validated convention | Observed in an existing vault file **and** confirmed resolvable by `scripts/validate_note.py`. |
| current-runtime content | Content inside an agent block whose id was issued during this run. There is no other definition; see `AGENTS.md`, "Ownership". |
| visually inspected | A rendered screenshot of the actual note was captured and examined at full resolution in this run. Nothing else earns this word. |

## Bundled resources

| Path | Read it when |
| --- | --- |
| `references/reconstruction.md` | Steps 5-7: page maps, reading graph, prominence, transcription, safe normalisation, uncertainty, multi-page and code handling. |
| `references/rendering.md` | Steps 8-9: renderer selection, LaTeX, Mermaid, Excalidraw/SVG, matrices and tensors, portability and accessibility. |
| `references/validation.md` | Steps 11-13: transactional append protocol, capability-aware validation matrix, statuses, completion report template. |
| `references/evaluation.md` | Changing this skill, or checking it for regressions. |
| `assets/note-template.md` | Step 10: frame for a new note. |
| `assets/runtime-block.md` | Step 10: agent-block wrapper. |
| `assets/provenance-callout.md` | Step 10: provenance and audit callouts. |
| `scripts/verify_append_only.py` | Step 11. |
| `scripts/validate_note.py` | Step 12. |
| `scripts/vaultpath.py` | Shared path-security helpers used by both validators. |
