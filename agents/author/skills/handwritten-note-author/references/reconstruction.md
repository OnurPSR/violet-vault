# Reconstruction: page analysis, transcription, uncertainty

Steps 5-7 of the skill workflow. Read with `SKILL.md`; `../../AGENTS.md` remains
authoritative for the rules it owns.

Contents:

1. [Build a page map](#1-build-a-page-map)
2. [Recover the reading graph](#2-recover-the-reading-graph)
3. [Determine prominence](#3-determine-prominence)
4. [Transcribe before polishing](#4-transcribe-before-polishing)
5. [Presentation-safe normalisation](#5-presentation-safe-normalisation)
6. [Handle uncertainty explicitly](#6-handle-uncertainty-explicitly)
7. [Source claims and the technical audit](#7-source-claims-and-the-technical-audit)
8. [Multi-page notes](#8-multi-page-notes)
9. [Code on the page](#9-code-on-the-page)

Analyse every page before writing any of the note. Partial analysis produces
reading-order errors that are expensive to detect later.

## 1. Build a page map

For each page, identify: page boundary and orientation; title and section
headings; text blocks and lists; equations and derivations; code; tables;
matrices, tensors, and vector groups; axes, curves, arrows, braces, circles,
boxes, highlights; labels attached to visual elements; marginal notes and
corrections; cross-page continuations.

Hold each region internally as:

- normalised bounding box `(x, y, width, height)` — horizontal coordinates
  divided by page width, vertical by page height, so placement and scale are
  comparable across pages photographed at different sizes;
- content type;
- transcription;
- transcription confidence (high / medium / low, per section 6);
- visual prominence (P1-P4, per section 3);
- links to nearby or connected regions;
- reading-order predecessors and successors.

These coordinates are working state. Do not print them in the note.

## 2. Recover the reading graph

Do not assume top-to-bottom. Determine order from, in priority:

1. arrows and connector direction;
2. containment and braces;
3. adjacency and alignment;
4. explicit numbering;
5. conventional mathematical reading order;
6. position (top-to-bottom, left-to-right) — fallback only.

When an arrow connects text to a matrix, or a label sits beside an axis, they
are one semantic unit: they MUST end up in the same figure, diagram, or table,
not in separate sections. A caption may explain a figure; it MUST NOT be used to
relocate a label away from the thing it labels.

## 3. Determine prominence

- **P1 focal** — page title, central model, primary architecture, dominant equation.
- **P2 major** — large matrix, principal diagram, main derivation, major section.
- **P3 supporting** — explanation, example, component label, local equation.
- **P4 annotation** — marginal note, correction, question, small reminder.

Express prominence through heading depth, embed width, display vs inline math,
and callout use. A P4 margin note MUST NOT become a major section.

## 4. Transcribe before polishing

Do a faithful transcription pass first, for every page, before any formatting
decision. Then apply only the normalisations in section 5.

Preserve: terminology, claims, notation, symbol case, indices, arrow direction,
and approximation versus equality (`\approx` is never rewritten to `=`).
Preserve repetition when it carries explanatory or spatial meaning.

Do not flatten arrows, branches, braces, matrices, coordinate spaces,
architectures, or annotated figures into bullet lists; choose a renderer instead
(`rendering.md`).

## 5. Presentation-safe normalisation

A normalisation is **presentation-safe** only when the change cannot alter
meaning, identity, or searchability. Permitted:

- collapse redundant whitespace and fix line-wrap artefacts;
- standard mathematical typography (proper minus signs, spacing, `\times`);
- punctuation added only where the reading is unambiguous;
- code formatting applied to identifiers and API names — formatting only, never
  respelling;
- capitalisation of **ordinary prose** at sentence start, when unquestionably
  safe.

Case MUST be preserved exactly for: code identifiers · API and library names ·
mathematical variables (`x` and `X` are different objects) · tensor names ·
filenames · paths · citations · acronyms · proper nouns · units. When unsure
whether a token is prose, treat it as exact.

Never "tidy" a subscript, index range, transpose mark, or dimension into a
neater but different expression.

## 6. Handle uncertainty explicitly

| Reading confidence | Action |
| --- | --- |
| High — one reading, clearly legible | Transcribe normally. |
| Medium — one dominant reading, some doubt | Transcribe it, and record the alternative in the collapsed audit callout (`assets/provenance-callout.md`). |
| Low — several plausible readings | Inline: `[illegible: option A / option B]`. |
| Unreadable numeric or mathematical content | Never infer it from a nearby expected result. Mark it, or mark the inference explicitly as an inference. |

Context — surrounding equations, repeated terminology, domain conventions — MAY
be used to disambiguate handwriting, but contextual inference and direct reading
MUST remain distinguishable in the note. "Probably `d_model`" is an inference
and is labelled as one.

Uncertainty disclosure is not optional politeness; it is precedence level 4 in
`AGENTS.md` and outranks a tidy-looking page.

## 7. Source claims and the technical audit

The transcription and any audit of it are separate artefacts with separate
statuses.

- The source expression is preserved exactly, always. It is never replaced by a
  corrected one, and never silently adjusted to satisfy a checklist item.
- A **source-level technical audit** — recomputing arithmetic, checking
  dimensional consistency, sanity-checking a claim — is optional and only
  performed when the user asked for it or it is clearly in scope.
- When an audit finds a discrepancy, report it in a clearly separated technical
  check annotation next to (not inside) the transcription:

  ```markdown
  > [!warning]- Technical check (added by the agent, not from the source)
  > Transcription fidelity: verbatim, high confidence.
  > Source-level audit: recomputed $3 \times 7 = 21$; the page states 22.
  > The source expression above is unchanged.
  ```

- A dimensionally inconsistent source stays inconsistent in the transcription.
  The inconsistency is reported, not repaired.
- When no audit was performed, say so: "technically audited: not requested".
  "Faithfully transcribed" and "mathematically verified" are different claims
  and MUST NOT be merged.

## 8. Multi-page notes

- Preserve source-page order unless arrows or explicit numbering establish
  another order.
- Merge a thought split across a page boundary into one continuous section when
  the continuation is unambiguous.
- Keep a `## Page N` heading only when the physical boundary itself carries
  meaning or removes ambiguity.
- Do not duplicate the same text both inside a figure and immediately below it;
  the figure keeps it (section 2).
- When several pages develop one object progressively, reuse notation
  consistently and show the progression.
- When a later page corrects an earlier one, keep both: the original, then the
  correction, clearly marked as a correction made by the source author.

## 9. Code on the page

- Preserve the algorithm, structure, and visible comments.
- Use the correct language fence.
- Preserve tensor shapes, types, parameters, and return values exactly.
- Do not modernise an API silently. If the handwritten API is outdated, keep it
  in the faithful core and put the current form in a separately marked
  commentary block.
- Label conceptual pseudocode as pseudocode.
- Never complete an incomplete fragment into a runnable program without marking
  precisely what was added.
