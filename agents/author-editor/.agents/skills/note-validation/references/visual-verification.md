# Generated Figure Visual Verification

Apply this check to every figure created or regenerated during the current task.
Static inspection of Mermaid text, Excalidraw data, SVG markup, or image metadata
does not satisfy it.

Verification is an inspection-and-correction loop, not an evidence-production
task. Do not record video or audio, start a screen-recording session, create a
demonstration of the note, or add verification media to the vault. A still
screenshot may be used only as temporary inspection input outside the vault.

1. Inspect a still rendering of the figure in its final note format beside the
   original source image or source region. When no image source exists, use only
   the explicit source text or data supplied for the figure.
2. Identify concrete mismatches in content, labels, values, formulas,
   connectors, direction, grouping, placement, scale, clipping, or legibility.
3. Correct only observed mismatches, then rerender and compare again. Do not
   infer missing details, redesign already matching regions, or add content not
   established by the source.

Use `PASS` only after direct visual inspection. Use `FAIL` for a mismatch and
`INCOMPLETE` when the required renderer, source content, or rendered output is
unavailable. Report the affected figure and material discrepancy; do not replace
this check with a static proxy or another capture workflow.
